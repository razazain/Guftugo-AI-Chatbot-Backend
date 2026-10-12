import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { UserModel } from '../models/User';
import { ConversationModel } from '../models/Conversation';
import { MessageModel } from '../models/Message';
import { RefreshTokenModel } from '../models/RefreshToken';
import { UsageLogModel } from '../models/UsageLog';
import { ProviderHealthLogModel } from '../models/ProviderHealthLog';
import { UploadedDocumentModel } from '../models/UploadedDocument';

async function createIndexes() {
  try {
    await connectDatabase();
    await Promise.all([
      UserModel.createIndexes(),
      ConversationModel.createIndexes(),
      MessageModel.createIndexes(),
      RefreshTokenModel.createIndexes(),
      UsageLogModel.createIndexes(),
      ProviderHealthLogModel.createIndexes(),
      UploadedDocumentModel.createIndexes(),
    ]);
    logger.info('MongoDB indexes ensured for Guftugo models');
  } catch (error) {
    logger.fatal({ error }, 'Could not create MongoDB indexes');
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void createIndexes();
