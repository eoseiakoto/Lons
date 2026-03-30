import { Provider } from '@nestjs/common';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

export const PUB_SUB = 'PUB_SUB';

export const PubSubProvider: Provider = {
  provide: PUB_SUB,
  useFactory: () => {
    if (process.env.NODE_ENV === 'test') {
      // Use in-memory PubSub for tests
      const { PubSub } = require('graphql-subscriptions');
      return new PubSub();
    }

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    return new RedisPubSub({
      publisher: new Redis(redisUrl),
      subscriber: new Redis(redisUrl),
    });
  },
};
