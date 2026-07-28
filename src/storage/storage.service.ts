import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as firebase from 'firebase-admin';

const MAX_PROFILE_IMAGE_BYTES = 500 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

@Injectable()
export class StorageService {
  private getBucket() {
    try {
      const storageApp = firebase.app('storage');
      return firebase.storage(storageApp).bucket();
    } catch (e) {
      throw new HttpException('Image storage is not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async deleteProfileImage(imageUrl: string): Promise<void> {
    const bucket = this.getBucket();
    const prefix = `https://storage.googleapis.com/${bucket.name}/`;
    if (!imageUrl.startsWith(prefix)) return;

    const filePath = imageUrl.slice(prefix.length);
    try {
      await bucket.file(filePath).delete({ ignoreNotFound: true });
    } catch (e) {
      throw new HttpException('Failed to delete image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
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

    const extension = contentType.split('/')[1];
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.byteLength > MAX_PROFILE_IMAGE_BYTES) {
      throw new HttpException('Image is too large. Maximum size is 500KB.', HttpStatus.BAD_REQUEST);
    }

    const bucket = this.getBucket();
    const filePath = `profile-images/${userId}-${Date.now()}.${extension}`;
    const file = bucket.file(filePath);

    try {
      await file.save(buffer, { metadata: { contentType }, public: true });
      return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } catch (e) {
      throw new HttpException('Failed to upload image', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
