import { NestFactory } from '@nestjs/core';
import { STATUS_CODES } from 'http';
import { json, urlencoded } from 'express';
import * as firebase from 'firebase-admin';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Separate Firebase project used for profile image storage.
  if (process.env.FIREBASE_STORAGE_SERVICE_ACCOUNT_KEY) {
    const storageServiceAccount = JSON.parse(
      process.env.FIREBASE_STORAGE_SERVICE_ACCOUNT_KEY as string,
    );
    firebase.initializeApp(
      {
        credential: firebase.credential.cert(storageServiceAccount),
        storageBucket: (process.env.FIREBASE_STORAGE_BUCKET || '').replace(/^gs:\/\//, ''),
      },
      'storage',
    );
  }
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  app.use(urlencoded({ extended: false }));
  app.use(json({ limit: '100mb' }));
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => {
        const result = errors.map((error) => ({
          property: error.property,
          message: error.constraints[Object.keys(error.constraints)[0]],
        }));
        return new BadRequestException({
          validationErrors: result,
          error: STATUS_CODES[400],
          statusCode: 400,
        });
      },
      stopAtFirstError: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Expensify API')
    .setDescription('API documentation for the Expensify backend')
    .setVersion('0.0.1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(+process.env.PORT || 3000, () => {
    console.log('Server is listening on port: ' + process.env.PORT);
  });
}
bootstrap();
