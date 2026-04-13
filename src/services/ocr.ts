import axios from 'axios';
import { VehicleInfo } from '../types/index';

class OCRService {
  async recognizeDrivingLicense(imageBuffer: Buffer): Promise<VehicleInfo> {
    const secretId = process.env.TENCENT_SECRET_ID!;
    const secretKey = process.env.TENCENT_SECRET_KEY!;
    
    const base64Image = imageBuffer.toString('base64');
    const timestamp = Math.floor(Date.now() / 1000);
    
    const payload = {
      ImageBase64: base64Image
    };
    
    const signature = this.generateSignature(secretId, secretKey, timestamp, JSON.stringify(payload));
    
    const response = await axios.post(
      'https://ocr.tencentcloudapi.com/',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-TC-Action': 'VehicleLicenseOCR',
          'X-TC-Version': '2018-11-19',
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Region': 'ap-guangzhou',
          'Authorization': signature
        }
      }
    );
    
    const data = response.data.Response;
    return {
      plate: data.PlateNumber || '',
      ownerName: data.Owner || '',
      licenseIssueDate: data.RegistDate || '',
      vehicleTypeRaw: data.VehicleType || '',
      useNatureRaw: data.UseNature || ''
    };
  }
  
  private generateSignature(secretId: string, secretKey: string, timestamp: number, payload: string): string {
    const crypto = require('crypto');
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const service = 'ocr';
    const host = 'ocr.tencentcloudapi.com';
    const algorithm = 'TC3-HMAC-SHA256';
    
    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`;
    const signedHeaders = 'content-type;host';
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
    
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;
    
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
    
    const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    
    return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  }
  
  async recognizeQuote(imageBuffer: Buffer): Promise<{ displayId: string; combo: string; premium: number; thirdLimit: string; rawText: string }> {
    const paddleUrl = process.env.PADDLE_OCR_URL || 'http://localhost:8866/predict/ocr_system';
    
    try {
      const base64Image = imageBuffer.toString('base64');
      const response = await axios.post(paddleUrl, {
        images: [base64Image]
      });
      
      const text = response.data.results[0].data.map((item: any) => item.text).join('\n');
      
      const displayIdMatch = text.match(/([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼]?[A-Z][A-Z0-9]{4,5})[_\s]+([\u4e00-\u9fa5]{2,4})[_\s]+(\d{8})/);
      const displayId = displayIdMatch ? `${displayIdMatch[1]}_${displayIdMatch[2]}_${displayIdMatch[3]}` : '';
      
      const { detectComboFromKeywords, extractPremium, extractThirdLimit } = await import('../utils/helpers');
      const combo = detectComboFromKeywords(text);
      const premium = extractPremium(text);
      const thirdLimit = extractThirdLimit(text);
      
      return { displayId, combo, premium, thirdLimit, rawText: text };
    } catch (error) {
      console.error('PaddleOCR识别失败:', error);
      return { displayId: '', combo: '', premium: 0, thirdLimit: '', rawText: '' };
    }
  }
}

export const ocrService = new OCRService();