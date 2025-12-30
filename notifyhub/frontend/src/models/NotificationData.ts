interface INotificationData {
  message: string;
  pwd?: string | null;
  [key: string]: any;
}

class NotificationData implements INotificationData {
  message: string;
  pwd: string | null;
  [key: string]: any;

  constructor(data: any) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid notification data: must be an object');
    }
    if (!data.message || typeof data.message !== 'string') {
      throw new Error('Invalid notification data: message is required and must be a string');
    }
    this.message = data.message;
    this.pwd = data.pwd || null;
    // Allow extra fields
    Object.assign(this, data);
  }

  // Method to get display data
  toDisplay(): { message: string; pwd: string | null } {
    return {
      message: this.message,
      pwd: this.pwd,
    };
  }
}

export default NotificationData;