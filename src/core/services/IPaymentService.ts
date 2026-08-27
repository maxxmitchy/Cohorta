export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentRequest {
  userId: string;
  planId: string;
  amount: number;
  currency: string;
}

export interface IPaymentService {
  /**
   * Processes a mock checkout payment with authoritative amount and currency.
   */
  processPayment(request: PaymentRequest): Promise<PaymentResult>;
}

