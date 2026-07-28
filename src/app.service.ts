import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      name: 'Expensify API',
      status: 'ok',
      version: process.env.npm_package_version || '0.0.1',
      docs: '/api/docs',
      timestamp: new Date().toISOString(),
    };
  }

  renderStatusPage() {
    const { name, status, version, docs, timestamp } = this.getStatus();

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${name}</title>
        </head>
        <body style="margin: 0; background-color: #F5F5F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh;">
          <div style="max-width: 420px; width: 100%; margin: 24px; background-color: #ffffff; border: 1px solid #ECECEC; border-radius: 12px; padding: 32px;">
            <span style="font-size: 18px; font-weight: 700; color: #6B5DE6;">${name}</span>
            <div style="margin-top: 16px; display: flex; align-items: center; gap: 8px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background-color: #2FB86E; display: inline-block;"></span>
              <span style="color: #1A1A1A; font-size: 15px; font-weight: 600;">${status === 'ok' ? 'Operational' : status}</span>
            </div>
            <table style="margin-top: 20px; width: 100%; font-size: 13px; color: #666666; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #888888;">Version</td>
                <td style="padding: 6px 0; text-align: right;">${version}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #888888;">Server time</td>
                <td style="padding: 6px 0; text-align: right;">${timestamp}</td>
              </tr>
            </table>
            <a href="${docs}" style="margin-top: 24px; display: block; text-align: center; background-color: #6B5DE6; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px; border-radius: 8px;">View API docs</a>
          </div>
        </body>
      </html>
    `;
  }
}
