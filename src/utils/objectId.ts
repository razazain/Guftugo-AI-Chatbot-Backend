import mongoose from 'mongoose';
import { AppError } from './AppError';

export function assertObjectId(value: string, label = 'id'): void {
  if (!mongoose.isValidObjectId(value)) {
    throw new AppError(400, 'INVALID_ID', `The provided ${label} is invalid.`);
  }
}
