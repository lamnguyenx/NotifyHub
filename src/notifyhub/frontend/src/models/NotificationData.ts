interface INotification {
  id: string;
  message: string;
  pwd?: string | null;
  timestamp: string;
  [key: string]: any;
}

class Notification implements INotification {
  id: string;
  message: string;
  pwd: string | null;
  timestamp: string;
  [key: string]: any;

  constructor(data: any) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid notification data: must be an object');
    }
    if (!data.id || typeof data.id !== 'string') {
      throw new Error('Invalid notification data: id is required and must be a string');
    }
    if (!data.message || typeof data.message !== 'string') {
      throw new Error('Invalid notification data: message is required and must be a string');
    }
    if (!data.timestamp || typeof data.timestamp !== 'string') {
      throw new Error('Invalid notification data: timestamp is required and must be a string');
    }
    this.id = data.id;
    this.message = data.message;
    this.pwd = data.pwd || null;
    this.timestamp = data.timestamp;
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

export default Notification;