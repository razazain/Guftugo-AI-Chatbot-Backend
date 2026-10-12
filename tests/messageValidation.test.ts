import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { MessageModel } from '../src/models/Message';

const base = {
  userId: new Types.ObjectId(),
  conversationId: new Types.ObjectId(),
};

describe('Message content validation for streamed replies', () => {
  it('allows an empty pending assistant message while streaming starts', () => {
    const message = new MessageModel({
      ...base,
      role: 'assistant',
      status: 'pending',
      content: '',
    });

    expect(message.validateSync()).toBeUndefined();
  });

  it('allows an empty failed assistant message when generation fails before output', () => {
    const message = new MessageModel({
      ...base,
      role: 'assistant',
      status: 'failed',
      content: '',
    });

    expect(message.validateSync()).toBeUndefined();
  });

  it('still requires content on user messages', () => {
    const message = new MessageModel({
      ...base,
      role: 'user',
      status: 'complete',
      content: '',
    });

    expect(message.validateSync()?.errors.content).toBeDefined();
  });

  it('still requires content on completed assistant messages', () => {
    const message = new MessageModel({
      ...base,
      role: 'assistant',
      status: 'complete',
      content: '',
    });

    expect(message.validateSync()?.errors.content).toBeDefined();
  });
});
