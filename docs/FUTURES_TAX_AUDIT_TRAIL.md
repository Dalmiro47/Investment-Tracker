# Futures Tax Audit Trail - Complete Transaction History

## 📋 Resumen

El sistema ahora registra **TODAS** las órdenes/trades individuales de futures, no solo un evento fiscal agregado. Esto proporciona un **audit trail completo** para las autoridades fiscales.

---

## 🔧 Implementación

### **Arquitectura de Transacciones**

```
investments/{investmentId}/transactions/
├── {fill_id_1} - Primera orden BUY
├── {fill_id_2} - Segunda orden BUY
├── {fill_id_3} - Primera orden SELL (isTaxEvent: true)
├── {fill_id_4} - Segunda orden SELL (isTaxEvent: true)
└── {fill_id_5} - Orden SELL final que cierra (isTaxEvent: true, isClosingFill: true)
```

### **Estructura de Cada Transacción**

```typescript
{
  id: "fill_abc123",
  type: "Buy" | "Sell",
  date: "2025-12-22T14:30:00Z",
  quantity: 0.165,
  pricePerUnit: 2995.3,
  totalAmount: 493.82,  // En EUR
  currency: "EUR",
  exchangeRate: 0.85143,
  valueInEur: 493.82,
  metadata: {
    // Tax classification
    isTaxEvent: true,       // true si reduce/cierra la posición
    
    // Fill details
    orderId: "ORDER-xyz",
    fillId: "fill_abc123",
    symbol: "PF_ETHUSD",
    side: "sell",
    positionSide: "LONG",
    
    // Aggregate data (SOLO en el fill de cierre)
    netRealizedPnlEur: 427.33,  // P&L neto total de la posición
    grossPnlEur: 455.50,        // P&L bruto
    feeEur: 15.40,              // Fees totales
    fundingEur: -12.77,         // Funding total
    isClosingFill: true,        // Marca el último fill
  }
}
```

---

## 🎯 Lógica de Tax Events

### **Qué transacciones se marcan como `isTaxEvent: true`**

1. **Posición LONG**: Todas las órdenes **SELL** que reducen/cierran
2. **Posición SHORT**: Todas las órdenes **BUY** que reducen/cierran

### **Ejemplo: Posición LONG ETH**

```
Estado inicial: 0 ETH

1. BUY 0.5 ETH @ $3000  → netPosition: +0.5  | isTaxEvent: false
2. BUY 0.3 ETH @ $3100  → netPosition: +0.8  | isTaxEvent: false
3. BUY 0.2 ETH @ $3200  → netPosition: +1.0  | isTaxEvent: false
4. SELL 0.3 ETH @ $3500 → netPosition: +0.7  | isTaxEvent: TRUE ✓ (reduce)
5. SELL 0.4 ETH @ $3600 → netPosition: +0.3  | isTaxEvent: TRUE ✓ (reduce)
6. SELL 0.3 ETH @ $3700 → netPosition: 0     | isTaxEvent: TRUE ✓ (cierre)
                                               | isClosingFill: TRUE ✓
```

### **Ejemplo: Posición SHORT ADA**

```
Estado inicial: 0 ADA

1. SELL 100 ADA @ $0.50 → netPosition: -100 | isTaxEvent: false
2. SELL 50 ADA @ $0.48  → netPosition: -150 | isTaxEvent: false
3. BUY 50 ADA @ $0.45   → netPosition: -100 | isTaxEvent: TRUE ✓ (reduce)
4. BUY 100 ADA @ $0.42  → netPosition: 0    | isTaxEvent: TRUE ✓ (cierre)
                                              | isClosingFill: TRUE ✓
```

---

## 📊 Procesamiento en Tax Report

### **Cálculo de Gains/Losses**

El código en `portfolio.ts` lee todas las transacciones con `isTaxEvent: true`:

```typescript
sellsInYear.forEach((t) => {
  const isTaxEvent = (t as any).metadata?.isTaxEvent === true;
  if (!isTaxEvent) return; // Skip órdenes que aumentan posición

  let netPnL = dec(0);
  
  // 1) Preferred: Si es el fill de cierre, usar el P&L agregado
  if ((t as any).metadata?.netRealizedPnlEur !== undefined) {
    netPnL = dec((t as any).metadata.netRealizedPnlEur);
  } else {
    // 2) Fallback: Calcular de la transacción individual
    const grossPnL = getEur(t);
    const fee = dec((t as any).metadata?.feeEur ?? 0);
    netPnL = sub(grossPnL, fee);
  }

  // Separar gains y losses
  if (netPnL.gt(0)) {
    futuresGainsYear = add(futuresGainsYear, netPnL);
  } else if (netPnL.lt(0)) {
    futuresLossesYear = add(futuresLossesYear, netPnL.abs());
  }
});
```

### **¿Por qué solo el fill de cierre tiene netRealizedPnlEur?**

- Los fills intermedios que reducen la posición **no tienen P&L calculado individualmente** en Kraken
- Solo el **fill final de cierre** tiene el `realized_pnl` del account log
- Los fills intermedios se marcan como `isTaxEvent: true` para audit, pero su P&L se calcula de forma aproximada o se ignora si no hay datos suficientes

---

## 🔍 Audit Trail Completo

### **Ventajas del Nuevo Sistema**

1. ✅ **Transparencia Total**: Todas las órdenes registradas, no solo agregados
2. ✅ **Trazabilidad**: Cada fill tiene su `order_id` y `fill_id` de Kraken
3. ✅ **Fechas Precisas**: Cada trade tiene su timestamp exacto
4. ✅ **Exchange Rates Diarios**: Cada transacción usa el tipo de cambio del día
5. ✅ **Audit Compliant**: Las autoridades pueden verificar cada operación contra Kraken

### **Export CSV para Auditoría**

El CSV de auditoría ahora incluirá:

```csv
Date,Type,Asset,Quantity,Price,Total EUR,Order ID,Fill ID,Tax Event,Net P&L
2025-12-19,Buy,ETH,0.165,2995.3,493.82,ORDER-1,fill_1,No,
2025-12-20,Buy,ETH,0.133,3010.5,405.23,ORDER-2,fill_2,No,
2025-12-21,Sell,ETH,0.034,2930.2,100.80,ORDER-3,fill_3,Yes,
2025-12-22,Sell,ETH,0.165,2995.3,500.45,ORDER-4,fill_4,Yes,
2025-12-22,Sell,ETH,0.099,3009.0,301.90,ORDER-5,fill_5,Yes,427.33
```

---

## 🚀 Próximos Pasos

### **Testing**

1. Ejecutar sync completo
2. Verificar en Firestore:
   - `investments/{id}/transactions/` debe tener múltiples docs
   - Cada transacción debe tener metadata completa
3. Abrir Tax Report 2025
4. Verificar que gains/losses se calculan correctamente
5. Exportar CSV y verificar todas las transacciones

### **Consideraciones**

- **Performance**: Para posiciones con muchos fills (100+), la creación de transacciones puede tardar
- **Rate Limits**: La API de exchange rates (Frankfurter) tiene límites diarios
- **Batching**: El código usa batches de 500 operaciones para no exceder límites de Firestore

---

## ⚠️ Notas Importantes

1. **Una transacción por fill**: Cada fill de Kraken = 1 transaction doc
2. **isTaxEvent marca reducción**: Solo fills que reducen/cierran tienen `isTaxEvent: true`
3. **isClosingFill es único**: Solo el último fill de cierre tiene esta marca
4. **netRealizedPnlEur solo en cierre**: Los fills intermedios no tienen P&L total agregado
5. **Posiciones abiertas**: Actualmente solo aplica a cerradas, se puede extender a abiertas después

---

## 📚 Referencias

- Tax Rules: German §20 Abs. 6 EStG (Capital Income from Derivatives)
- Kraken API: `/derivatives/api/v3/fills` (Historical Trade Executions)
- Frankfurter API: Daily ECB Exchange Rates
- Firebase Batching: Max 500 operations per batch
