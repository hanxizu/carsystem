import { supabase } from '../db/supabase.js';
import { TaskData, SessionData } from '../types/index.js';
import { generateTaskId, detectVehicleType, detectOperationType, detectBusinessType } from '../utils/helpers.js';
class TaskService {
  async createTask(session: SessionData): Promise<string> {
    const taskId = generateTaskId(session.vehicleInfo!.plate, session.vehicleInfo!.ownerName);
    
    const taskData: TaskData = {
      taskId,
      plate: session.vehicleInfo!.plate,
      ownerName: session.vehicleInfo!.ownerName,
      date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      vehicleType: detectVehicleType(session.vehicleInfo!.vehicleTypeRaw),
      operationType: detectOperationType(session.vehicleInfo!.useNatureRaw),
      businessType: detectBusinessType(session.vehicleInfo!.licenseIssueDate),
      combos: session.combos || [],
      phone: session.phone || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('tasks')
      .upsert(taskData, { onConflict: 'task_id' });
    
    if (error) throw error;
    
    return taskId;
  }
  
  async getTask(taskId: string): Promise<TaskData | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();
    
    if (error) return null;
    return data as TaskData;
  }
  
  async updateTaskStatus(taskId: string, status: TaskData['status']): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('task_id', taskId);
    
    if (error) throw error;
  }
  
  async saveQuote(quoteData: any): Promise<void> {
    const { error } = await supabase
      .from('quotes')
      .insert(quoteData);
    
    if (error) throw error;
  }
  
  async getQuotesByTask(taskId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('task_id', taskId);
    
    if (error) return [];
    return data;
  }
}

export const taskService = new TaskService();