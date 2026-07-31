import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

const MAX_PROFILE_IMAGE_BYTES = 1 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const MAX_ATTACHMENT_BYTES = 1 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

// Every upload in this service deterministically uses resource_type "image" (Cloudinary
// supports PDFs as an image-type asset, giving standard delivery/deletion semantics) with
// a public_id we choose ourselves - this keeps the resulting secure_url shape predictable
// enough to parse the public_id back out for deletion, given only the URL string stored in
// the database (matching this service's existing public signatures).
const CLOUDINARY_URL_PATTERN = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/v\d+\/(.+)\.[a-zA-Z0-9]+$/;

@Injectable()
export class StorageService {
  private configured = false;

  private configureCloudinary() {
    if (this.configured) return;

    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new HttpException('File storage is not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    });
    this.configured = true;
  }

  private async uploadFile(publicId: string, dataUri: string): Promise<string> {
    this.configureCloudinary();
    try {
      const result = await cloudinary.uploader.upload(dataUri, {
        public_id: publicId,
        resource_type: 'image',
        asset_folder: 'expensify-assets',
        overwrite: false,
      });
      return result.secure_url;
    } catch (e) {
      throw new HttpException('Failed to upload file', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async deleteFile(fileUrl: string): Promise<void> {
    const match = fileUrl.match(CLOUDINARY_URL_PATTERN);
    // Doesn't match a URL this service would have generated (e.g. a legacy URL from a
    // previous storage provider) - nothing we can clean up, so no-op rather than error.
    if (!match) return;

    this.configureCloudinary();
    const publicId = match[1];
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (e) {
      throw new HttpException('Failed to delete file', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteProfileImage(imageUrl: string): Promise<void> {
    return this.deleteFile(imageUrl);
  }

  async deleteTransactionAttachment(fileUrl: string): Promise<void> {
    return this.deleteFile(fileUrl);
  }

  async uploadProfileImage(userId: string, imageBase64: string): Promise<string> {
    const match = imageBase64.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if (!match) {
      throw new HttpException('Invalid image data', HttpStatus.BAD_REQUEST);
    }
    const [, contentType, rawBase64] = match;
    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(contentType)) {
      throw new HttpException(
        'Unsupported file type. Use JPEG, PNG, or WEBP.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.byteLength > MAX_PROFILE_IMAGE_BYTES) {
      throw new HttpException('Image is too large. Maximum size is 1MB.', HttpStatus.BAD_REQUEST);
    }

    const publicId = `profile-images/${userId}-${Date.now()}`;
    return this.uploadFile(publicId, imageBase64);
  }

  async uploadTransactionAttachment(userId: string, fileBase64: string): Promise<string> {
    const match = fileBase64.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
    if (!match) {
      throw new HttpException('Invalid file data', HttpStatus.BAD_REQUEST);
    }
    const [, contentType, rawBase64] = match;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
      throw new HttpException(
        'Unsupported file type. Use JPEG, PNG, WEBP, or PDF.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new HttpException('File is too large. Maximum size is 1MB.', HttpStatus.BAD_REQUEST);
    }

    const publicId = `transaction-attachments/${userId}-${Date.now()}`;
    return this.uploadFile(publicId, fileBase64);
  }
}
