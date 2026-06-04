/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'citizen' | 'officer' | 'supervisor' | 'manager' | 'admin';

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  role: UserRole;
  idCard?: string;
  phone?: string;
  address?: string;
  occupation?: string;
  requesterType?: 'individual' | 'juristic' | 'farmer';
  disabled?: boolean;
  createdAt: string;
}

export type ComplaintStatus = 'pending' | 'received' | 'in_progress' | 'resolved' | 'rejected';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  actorName: string;
  actorUid: string;
  previousStatus?: ComplaintStatus;
  newStatus?: ComplaintStatus;
  notes?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'status_change' | 'comment' | 'system';
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface Complaint {
  id?: string;
  trackingId: string;
  complainantUid: string;
  
  // Requester context
  fullName: string;
  idCard: string;
  phone: string;
  address: string;
  email: string;
  occupation?: string;
  requesterType?: string;
  pdpaAccepted: boolean;
  pdpaVersion: string;
  otpVerified?: boolean;

  // Complaint details
  title: string;
  category: string;
  subCategory?: string;
  departmentId?: string;
  departmentName?: string;
  severity: Severity;
  details: string;
  previouslyReported: boolean;
  
  // Impact and Location
  incidentDate: string;
  incidentTime?: string;
  incidentLocation?: string;
  province?: string;
  district?: string;
  subDistrict?: string;
  gpsCoordinates?: { lat: number; lng: number };
  
  // Agricultural specific
  damagedAreaRai?: number;
  damagedAreaNgan?: number;
  damageValue?: number;
  cropType?: string;
  
  // Action & Meta
  involvedPersons?: string;
  desiredAction: string;
  evidenceUrls?: string[];
  externalUrl?: string;
  status: ComplaintStatus;
  assignedOfficerUid?: string;
  officerNotes?: string;
  slaTargetDate?: string;
  createdAt: string;
  updatedAt: string;
  channel?: string;
  logs?: AuditLogEntry[];
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface Department {
  id: string;
  name: string;
  code?: string;
}
