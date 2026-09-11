import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import pgConnect = require('connect-pg-simple');
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { AllExceptionsFilter } from './core/filters/all-exceptions.filter';
import { HttpAdapterHost } from '@nestjs/core';
import helmet from 'helmet';
import { RedisIoAdapter } from './core/adapters/redis-io.adapter';
import { loggerConfig } from './core/config/logger.config';
import { getAllowedOrigins } from './core/allowed-origins';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: loggerConfig,
    rawBody: true,
  });

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const allowedOrigins = getAllowedOrigins();
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.set('trust proxy', 1);

  const PgSession = pgConnect(session);
  const isProduction = process.env.NODE_ENV === 'production';

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — session store will fail to initialize');
    process.exit(1);
  }

  if (isProduction && !process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set in production; refusing to start with the development fallback.');
  }
  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: 'sessions',
        createTableIfMissing: true,
      }),
      name: 'sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  // Revalidate the authenticated account against the database on every request.
  // Do not trust a cached user/role stored in the session for days: a dealer can
  // be suspended, an admin can change a role, or an account can be deleted while
  // the browser still owns a valid session cookie. userId is the only durable
  // session identity; the current role/profile is always loaded fresh.
  const authService = app.get(AuthService);
  app.use(async (req: any, _res: any, next: any) => {
    if (!req.session?.userId || req.user) return next();

    try {
      const user = await authService.validateSession(req.session.userId);
      if (!user) {
        req.session.destroy(() => { });
        return next();
      }

      req.user = user;
      // Keep compatibility with older code that reads these fields, but update
      // them from the database rather than accepting their previous values.
      req.session.userRole = user.role;
      req.session.cachedUser = user;
      return next();
    } catch (error) {
      console.error('Session hydration failed:', error);
      return next();
    }
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.use(helmet());
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));

  const config = new DocumentBuilder()
    .setTitle('Carmazium API')
    .setDescription('Core Marketplace Engine API for Carmazium')
    .setVersion('1.0')
    .addTag('Auth', 'User authentication')
    .addTag('Users', 'User profile management')
    .addTag('Listings', 'Vehicle listings management')
    .addTag('Bids', 'Auction bidding')
    .addTag('Watchlist', 'Saved listings')
    .addTag('Transactions', 'Payment & transaction history')
    .addTag('Service Requests', 'Contractor service requests')
    .addTag('Chat', 'Real-time messaging')
    .addCookieAuth('sid')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 8080;
  await app.listen(port, '0.0.0.0');

  const shutdown = async () => {
    if (typeof redisIoAdapter.close === 'function') await redisIoAdapter.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/api`);
}

bootstrap();
