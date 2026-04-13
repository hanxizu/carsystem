import axios from 'axios';

interface WeWorkConfig {
  corpId: string;
  corpSecret: string;
  agentId: string;
}

class WeWorkService {
  private config: WeWorkConfig;
  private accessToken: string = '';
  private tokenExpireTime: number = 0;

  constructor() {
    this.config = {
      corpId: process.env.WEWORK_CORP_ID!,
      corpSecret: process.env.WEWORK_CORP_SECRET!,
      agentId: process.env.WEWORK_AGENT_ID!
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.corpSecret}`;
    const response = await axios.get(url);
    
    if (response.data.errcode === 0) {
      this.accessToken = response.data.access_token;
      this.tokenExpireTime = Date.now() + (response.data.expires_in - 300) * 1000;
      return this.accessToken;
    }
    throw new Error(`获取access_token失败: ${response.data.errmsg}`);
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${token}&media_id=${mediaId}`;
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  async sendMessage(userId: string, content: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;
    
    await axios.post(url, {
      touser: userId,
      msgtype: 'text',
      agentid: this.config.agentId,
      text: { content }
    });
  }

  async updateCustomerRemark(userId: string, remark: string): Promise<void> {
    const token = await this.getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/externalcontact/remark?access_token=${token}`;
    
    await axios.post(url, {
      userid: userId,
      remark
    });
  }

  async sendToGroup(webhookUrl: string, content: string, images?: string[]): Promise<void> {
    if (images && images.length > 0) {
      for (const image of images) {
        await axios.post(webhookUrl, {
          msgtype: 'image',
          image: { base64: image }
        });
      }
    }
    
    await axios.post(webhookUrl, {
      msgtype: 'text',
      text: { content }
    });
  }
}

export const weworkService = new WeWorkService();