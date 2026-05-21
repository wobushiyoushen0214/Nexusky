export function isCurrentBatchOperation(currentOperationId: number, operationId: number): boolean {
  return currentOperationId === operationId
}

export function shouldApplyBatchOperationUpdate(currentOperationId: number, operationId: number, cancelled: boolean): boolean {
  return isCurrentBatchOperation(currentOperationId, operationId) && !cancelled
}

export function shouldApplyBatchProgressEvent(currentOperationId: number, operationId: number, cancelled: boolean, requestId: number | undefined): boolean {
  return requestId === operationId && shouldApplyBatchOperationUpdate(currentOperationId, operationId, cancelled)
}
