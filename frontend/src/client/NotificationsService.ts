// Manual NotificationsService - place in frontend/src/client/NotificationsService.ts
// Works alongside sdk.gen.ts without requiring regeneration

import { OpenAPI } from "./core/OpenAPI";
import { request as __request } from "./core/request";
import type { CancelablePromise } from "./core/CancelablePromise";

export interface NotificationsGetNurseNotificationsData {
  limit?: number;
  offset?: number;
  status?: string | null;
  notification_type?: string | null;
}

export interface NotificationsGetManagerNotificationsData {
  limit?: number;
  offset?: number;
  status?: string | null;
  notification_type?: string | null;
}

export interface NotificationsMarkNotificationsReadData {
  notification_ids: number[];
}

export interface NotificationResponse {
  notificationid: number;
  notificationtype: string;
  subject: string
  messagebody: string;
  priority: string;
  status: string;
  createdat: string;
  sentat: string | null;
  readat: string | null;
  relatedentitytype: string | null;
  relatedentityid: number | null;
}

export interface NotificationsListResponse {
  notifications: NotificationResponse[];
  total: number;
  unread_count: number;
}

export interface NotificationStatsResponse {
  total: number;
  unread: number;
  by_type: Record<string, number>;
  recent: NotificationResponse[];
}

export class NotificationsService {
  /**
   * Get Nurse Notifications
   * Get notifications for the current nurse
   */
  public static getNurseNotifications(
    data: NotificationsGetNurseNotificationsData = {}
  ): CancelablePromise<NotificationsListResponse> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/notifications/nurse",
      query: {
        limit: data.limit,
        offset: data.offset,
        status: data.status,
        notification_type: data.notification_type,
      },
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Get Manager Notifications
   * Get notifications for the current nurse manager
   */
  public static getManagerNotifications(
    data: NotificationsGetManagerNotificationsData = {}
  ): CancelablePromise<NotificationsListResponse> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/notifications/manager",
      query: {
        limit: data.limit,
        offset: data.offset,
        status: data.status,
        notification_type: data.notification_type,
      },
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Mark Notifications Read
   * Mark notifications as read
   */
  public static markNotificationsRead(
    data: NotificationsMarkNotificationsReadData
  ): CancelablePromise<{ message: string }> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/notifications/mark-read",
      body: {
        notification_ids: data.notification_ids,
      },
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Mark Notifications Unread
   * Mark notifications as unread
   */
  public static markNotificationsUnread(
    data: NotificationsMarkNotificationsReadData
  ): CancelablePromise<{ message: string }> {
    return __request(OpenAPI, {
      method: "POST",
      url: "/api/v1/notifications/mark-unread",
      body: {
        notification_ids: data.notification_ids,
      },
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }

  /**
   * Get Notification Stats
   * Get notification statistics for the current user
   */
  public static getNotificationStats(): CancelablePromise<NotificationStatsResponse> {
    return __request(OpenAPI, {
      method: "GET",
      url: "/api/v1/notifications/stats",
      errors: {
        404: "Not Found",
        422: "Validation Error",
      },
    });
  }
}