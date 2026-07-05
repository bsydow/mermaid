import type { DiagramMetadata } from '../types.js';

export default {
  id: 'domainstorytelling',
  name: 'Domain Storytelling Diagram',
  description: 'Visualize user interactions and system behavior in a narrative format',
  examples: [
    {
      title: 'E-commerce Domain Storytelling',
      isDefault: true,
      code: `domainstorytelling-beta

      icon A_Customer fa:fa-user
      icon A_Merchant fa:fa-store
      icon A_PaymentProvider fa:fa-credit-card
      icon A_ShippingService fa:fa-truck
      icon W_Product fa:fa-box
      icon W_Cart fa:fa-shopping-cart
      icon W_Order fa:fa-receipt
      icon W_Payment fa:fa-money-bill-wave
      icon W_Package fa:fa-package-open

      A_Customer : 01 -- "selects" -> W_Product
      A_Customer : 02 -- "adds to" -> W_Cart
      A_Customer : 03 -- "creates" -> W_Order -- "from" -> W_Cart
      A_Customer : 04 -- "submits" -> W_Payment
      A_PaymentProvider : 05 -- "processes" -> W_Payment
      A_Merchant : 06 -- "receives" -> W_Order
      A_Merchant : 07 -- "prepares" -> W_Package -- "for" -> W_Order
      A_ShippingService : 08 -- "delivers" -> W_Package -- "to" -> A_Customer`,
    },
  ],
} satisfies DiagramMetadata;
