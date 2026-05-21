export function isCurrentBatchOperation(currentOperationId: number, operationId: number): boolean {
  return currentOperationId === operationId
}

export function shouldApplyBatchOperationUpdate(currentOperationId: number, operationId: number, cancelled: boolean): boolean {
  return isCurrentBatchOperation(currentOperationId, operationId) && !cancelled
}
