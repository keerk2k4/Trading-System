import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './PasswordService';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('correct password verifies', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple');
    const result = await service.verifyPassword('correct-horse-battery-staple', hash);
    expect(result).toBe(true);
  });

  it('incorrect password fails verification', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple');
    const result = await service.verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('does not produce an MD5 or SHA style digest', async () => {
    const hash = await service.hashPassword('correct-horse-battery-staple');
    // A real bcrypt hash always starts with this prefix -- an MD5/SHA
    // digest would never produce this recognisable, fixed format.
    expect(hash.startsWith('$2')).toBe(true);
  });
});