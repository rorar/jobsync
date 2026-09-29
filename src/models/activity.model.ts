export interface ActivityType {
  id: string;
  label: string;
  value: string;
  createdBy: string;
  // Optional because getActivityTypeList's countBy branch selects only the four
  // fields above plus _count. The sibling reference models never hit this: Tag
  // (src/models/job.model.ts:114-123), JobTitle (:162-170) and JobSource
  // (:211-219) do not declare these three columns at all. Nothing in src/ reads
  // them off an ActivityType, so widening them costs nothing today — a future
  // reader that needs a timestamp must fetch a full row for it.
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  // Relation names are capitalised in the schema (prisma/schema.prisma:491-492),
  // so the count keys are Activities and Tasks, not activities and tasks.
  _count?: {
    Activities: number;
    Tasks: number;
  };
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
