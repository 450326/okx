import { Injectable, Logger } from '@nestjs/common';

/**
 * 邮件发送占位实现。
 * 生产环境接入 SMTP/SES 后替换 send 方法即可；开发环境把 token 打到日志。
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendVerification(email: string, token: string): Promise<void> {
    this.logger.log(`[email] verify ${email}: ${token}`);
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    this.logger.log(`[email] reset ${email}: ${token}`);
  }

  isDevExposeTokens(): boolean {
    return process.env.AUTH_EXPOSE_DEV_TOKENS !== 'false' && process.env.NODE_ENV !== 'production';
  }
}
