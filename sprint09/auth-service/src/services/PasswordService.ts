import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";

@Injectable()
export class PasswordService {

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async getDummyHash(): Promise<string> {
    return "$2b$12$LQv3c1yqBW1sQf8n3h9pUeQ8mK0W7Y4V1X2Z3A4B5C6D7E8F9G0H1";
  }
}
