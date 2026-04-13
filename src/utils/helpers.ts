
import { TaskData } from "../types/index";



export function generateTaskId(plate: string, ownerName: string): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${plate}_${ownerName}_${today}`;
}

export function extractCityFromPlate(plate: string): string {
  const cityMap: Record<string, string> = {
    '苏A': '南京', '苏B': '无锡', '苏C': '徐州', '苏D': '常州',
    '苏E': '苏州', '苏F': '南通', '苏G': '连云港', '苏H': '淮安',
    '苏J': '盐城', '苏K': '扬州', '苏L': '镇江', '苏M': '泰州', '苏N': '宿迁'
  };
  const prefix = plate.slice(0, 2);
  return cityMap[prefix] || '其他';
}

export function detectVehicleType(vehicleTypeRaw: string): TaskData['vehicleType'] {
  const isEv = vehicleTypeRaw.includes('电动') || vehicleTypeRaw.includes('新能源');
  const isTruck = vehicleTypeRaw.includes('货车');
  
  if (isTruck) return isEv ? 'truck_ev' : 'truck_gas';
  return isEv ? 'private_ev' : 'private_gas';
}

export function detectOperationType(useNatureRaw: string): TaskData['operationType'] {
  if (useNatureRaw.includes('预约出租客运')) return 'rideshare';
  if (useNatureRaw.includes('营运')) return 'commercial';
  return 'non_commercial';
}

export function detectBusinessType(licenseIssueDate: string): TaskData['businessType'] {
  const issueDate = new Date(licenseIssueDate);
  const now = new Date();
  const diffDays = (now.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (diffDays <= 365) return 'transfer';
  return 'renewal';
}

export function detectComboFromKeywords(text: string): string {
  const hasCompulsory = text.includes('交强险');
  const hasThird = text.includes('三者险');
  const hasDamage = text.includes('车损险');
  
  if (!hasCompulsory && hasThird) return 'combo_5';
  if (hasCompulsory && !hasThird && !hasDamage) return 'combo_4';
  if (hasCompulsory && hasThird && !hasDamage) return 'combo_2';
  if (hasCompulsory && hasThird && hasDamage) return 'combo_3';
  return 'combo_1';
}

export function extractPremium(text: string): number {
  const matches = text.match(/合计[：:]\s*(\d+(?:\.\d+)?)|总计[：:]\s*(\d+(?:\.\d+)?)|保费[：:]\s*(\d+(?:\.\d+)?)/g);
  if (!matches) return 0;
  
  let maxPremium = 0;
  for (const match of matches) {
    const num = parseFloat(match.replace(/[^0-9.]/g, ''));
    if (!isNaN(num) && num > maxPremium) maxPremium = num;
  }
  return maxPremium;
}

export function extractThirdLimit(text: string): string {
  const match = text.match(/三者险\s*(\d+(?:\.\d+)?)\s*万/);
  return match ? `${match[1]}万` : '';
}