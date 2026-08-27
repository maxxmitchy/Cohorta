import { IPaymentService, PaymentRequest, PaymentResult } from '../../../core/services/IPaymentService';

export class MockPaymentService implements IPaymentService {
  private shouldFailNext = false;

  /**
   * Helper for testing/simulating payment failures in mock environments.
   */
  setFailNext(shouldFail: boolean) {
    this.shouldFailNext = shouldFail;
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      return { success: false, error: 'Payment declined: Card has insufficient funds.' };
    }

    // Simple validation rule: if amount is negative, fail.
    if (request.amount < 0) {
      return { success: false, error: 'Invalid payment amount.' };
    }

    return {
      success: true,
      transactionId: `txn_mock_${Date.now()}`
    };
  }
}

