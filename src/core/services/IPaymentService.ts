export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface IPaymentService {
  /**
   * Processes a mock checkout payment.
   */
  processMockPayment(userId: string, planId: string, amount: number, currency: string): Promise<PaymentResult>;
}
