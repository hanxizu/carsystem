import { TaskData } from '../types/index';
import { extractCityFromPlate } from '../utils/helpers';
import { supabase } from '../db/supabase';
class RouteService {
  async getChannels(task: TaskData): Promise<any[]> {
    const city = extractCityFromPlate(task.plate);
    
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('city', city)
      .eq('vehicle_type', task.vehicleType)
      .eq('operation_type', task.operationType)
      .eq('business_type', task.businessType);
    
    if (error) return [];
    return data;
  }
  
  async distributeTask(task: TaskData, channels: any[], imageBuffers: Map<string, Buffer>): Promise<void> {
    const { weworkService } = await import('./wework');
    
    const textContent = `
【车险报价需求】
车主：${task.ownerName}
车牌：${task.plate}
险种：${task.combos.join(', ')}
手机号：${task.phone}
    `.trim();
    
    const images: string[] = [];
    for (const [key, buffer] of imageBuffers) {
      images.push(buffer.toString('base64'));
    }
    
    for (const channel of channels) {
      await weworkService.sendToGroup(channel.webhook_url, textContent, images);
    }
  }
}

export const routeService = new RouteService();