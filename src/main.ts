import { NestFactory } from '@nestjs/core';
import { STATUS_CODES } from 'http';
import { json, urlencoded, raw } from 'express';
import * as firebase from 'firebase-admin';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

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
  app.use((req, res, next) => {
    if (req.originalUrl === '/expensify/clerk/webhook') {
      raw({ type: 'application/json' })(req, res, next);
    } else {
      json({ limit: '100mb' })(req, res, next);
    }
  });
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
  await app.listen(+process.env.PORT || 3000, () => {
    console.log('Server is listening on port: ' + process.env.PORT);
  });
}
bootstrap();
