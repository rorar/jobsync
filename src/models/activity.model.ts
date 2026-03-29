export interface ActivityType {
  id: string;
  label: string;
  value: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Activity {
  id: string;
  activityTypeId: string;
  activityType?: ActivityType;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  activityName: string;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  description: string | null;
  taskId: string | null;
}
