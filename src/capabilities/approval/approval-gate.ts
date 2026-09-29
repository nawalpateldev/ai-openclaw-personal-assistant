import crypto from 'crypto';
import { ApprovalRequest, ApprovalStatus } from '../../types/index.js';

export type ActionHandler = (payload: any) => Promise<any>;

export class ApprovalGate {
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private handlers: Map<string, ActionHandler> = new Map();
  private listeners: ((approval: ApprovalRequest) => void)[] = [];

  registerHandler(actionType: string, handler: ActionHandler): void {
    this.handlers.set(actionType, handler);
  }

  onApprovalCreated(callback: (approval: ApprovalRequest) => void): void {
    this.listeners.push(callback);
  }

  /**
   * Request human approval for a consequential action
   */
  requestApproval(
    actionType: ApprovalRequest['actionType'],
    title: string,
    description: string,
    payload: any
  ): ApprovalRequest {
    const id = `apr_${crypto.randomBytes(4).toString('hex')}`;
    const approval: ApprovalRequest = {
      id,
      actionType,
      title,
      description,
      payload,
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    this.pendingApprovals.set(id, approval);

    // Notify listeners (WebSockets, Telegram notifications, etc.)
    for (const listener of this.listeners) {
      try {
        listener(approval);
      } catch (err) {
        console.error('[ApprovalGate] Error notifying approval listener:', err);
      }
    }

    return approval;
  }

  getApproval(id: string): ApprovalRequest | undefined {
    return this.pendingApprovals.get(id);
  }

  listPending(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).filter(
      (a) => a.status === 'pending'
    );
  }

  listAll(): ApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
    );
  }

  /**
   * Approve and execute the action
   */
  async approve(id: string, resolvedBy: string = 'admin'): Promise<{ success: boolean; result?: any; error?: string }> {
    const approval = this.pendingApprovals.get(id);
    if (!approval) {
      return { success: false, error: `Approval ticket '${id}' not found` };
    }
    if (approval.status !== 'pending') {
      return { success: false, error: `Approval ticket '${id}' is already ${approval.status}` };
    }

    const handler = this.handlers.get(approval.actionType);
    if (!handler) {
      return { success: false, error: `No action handler registered for '${approval.actionType}'` };
    }

    try {
      const result = await handler(approval.payload);
      approval.status = 'approved';
      approval.resolvedAt = new Date().toISOString();
      approval.resolvedBy = resolvedBy;
      return { success: true, result };
    } catch (err: any) {
      return { success: false, error: `Execution failed: ${err.message}` };
    }
  }

  /**
   * Reject the action
   */
  reject(id: string, reason?: string, resolvedBy: string = 'admin'): boolean {
    const approval = this.pendingApprovals.get(id);
    if (!approval || approval.status !== 'pending') {
      return false;
    }

    approval.status = 'rejected';
    approval.resolvedAt = new Date().toISOString();
    approval.resolvedBy = resolvedBy;
    approval.rejectionReason = reason || 'Rejected by user';
    return true;
  }
}
