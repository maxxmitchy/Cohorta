import { IPaymentService, PaymentResult } from '../../../core/services/IPaymentService';

export class MockPaymentService implements IPaymentService {
  async processMockPayment(userId: string, planId: string, amount: number, currency: string): Promise<PaymentResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Simple validation rule: if amount is negative or fake currency, fail.
    if (amount < 0) {
      return { success: false, error: 'Invalid payment amount.' };
    }

    return {
      success: true,
      transactionId: `txn_mock_${Date.now()}`
    };
  }
}
