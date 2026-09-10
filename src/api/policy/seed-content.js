'use strict';

// Initial copy for the four legal pages, written once into an empty database
// and then owned by the client. Nothing here is read at request time: after the
// first boot the Admin's Content Manager is the only source of this text, and
// the seeder never writes over a page that already exists.
//
// Every client-specific fact is a {{placeholder}} resolved from Policy Settings
// at request time, so no company name, address, licence number, phone, email,
// timeline or jurisdiction is invented in this file. Those all read
// "To be updated" until the client fills them in — in one place, once.

// --- Blocks helpers -------------------------------------------------------
// Strapi's Blocks format is a small JSON tree. Writing it out longhand would
// bury the actual policy text in punctuation, so these five functions build the
// nodes and the sections below read as prose.
const t = (text, marks) => ({ type: 'text', text, ...marks });
const bold = (text) => t(text, { bold: true });
const link = (url, text) => ({ type: 'link', url, children: [t(text)] });
const node = (child) => (typeof child === 'string' ? t(child) : child);
const p = (...children) => ({ type: 'paragraph', children: children.map(node) });
const li = (...children) => ({ type: 'list-item', children: children.map(node) });
const ul = (...items) => ({ type: 'list', format: 'unordered', children: items });
const ol = (...items) => ({ type: 'list', format: 'ordered', children: items });
const s = (heading, ...body) => ({ heading, body });

// Repeated verbatim on both consumer-facing policies on purpose: it is the
// sentence that keeps everything above it from reading as a waiver.
const CONSUMER_RIGHTS =
  'Nothing in this policy is intended to limit rights or remedies available to consumers under applicable law.';

// --- Policy Settings ------------------------------------------------------
// "To be updated" is deliberate. These are legal and regulatory facts; a
// plausible-looking guess is worse than a visible gap, because a wrong FSSAI
// number or grievance address is a compliance problem rather than a typo.
const POLICY_SETTINGS = {
  brandName: 'Aha Rasam',
  legalEntityName: 'To be updated',
  registeredAddress: 'To be updated',
  businessAddress: 'To be updated',
  supportEmail: 'To be updated',
  supportPhone: 'To be updated',
  grievanceOfficerName: 'To be updated',
  grievanceEmail: 'To be updated',
  grievancePhone: 'To be updated',
  fssaiLicenseNumber: 'To be updated',
  dispatchTimeline: 'To be updated',
  estimatedDeliveryTimeline: 'To be updated',
  refundProcessingTimeline: 'To be updated',
  cancellationWindow: 'To be updated',
  issueReportingWindow: 'To be updated',
  shippingChargesPolicy: 'Calculated and displayed during checkout',
  governingJurisdiction: 'To be updated',
};

// The storefront has no /contact route: "Contact" in the header scrolls to the
// contact section of the homepage, and this is the link that does that from
// another page. Pointing policy copy at /contact would 404.
const CONTACT_URL = '/?scroll=Contact';

// --- 1. Terms & Conditions ------------------------------------------------
const TERMS = {
  slug: 'terms-and-conditions',
  title: 'Terms & Conditions',
  seoTitle: 'Terms & Conditions | Aha Rasam',
  seoDescription:
    'The terms that govern use of the Aha Rasam website and the purchase of products through it, including orders, pricing, payments, delivery and returns.',
  intro:
    'These Terms & Conditions govern your access to and use of the Aha Rasam website and the purchase of products offered through it. By accessing the website or placing an order, you agree to these terms.',
  sections: [
    s(
      'About Aha Rasam',
      p(
        '{{brandName}} offers packaged food products sold through this website. The website is operated by {{legalEntityName}}, with its place of business at {{businessAddress}}.'
      ),
      p('FSSAI licence number: {{fssaiLicenseNumber}}.'),
      p(
        'In these terms, "we", "us" and "our" refer to the operator of this website, and "you" refers to the person accessing the website or placing an order.'
      )
    ),
    s(
      'Acceptance of Terms',
      p(
        'By using this website, creating an account or placing an order, you confirm that you have read and accepted these terms. If you do not agree with them, please do not use the website.'
      ),
      p('These terms should be read together with:'),
      ul(
        li(link('/privacy-policy', 'Privacy Policy')),
        li(link('/shipping-policy', 'Shipping & Delivery Policy')),
        li(link('/refund-policy', 'Cancellation, Return & Refund Policy'))
      ),
      p('Those policies form part of these terms.')
    ),
    s(
      'Eligibility',
      p(
        'You may use this website and place orders only if you are capable of entering into a legally binding contract under applicable law. If you are below the age of majority, please use the website only with the involvement of a parent or guardian, who will be responsible for the order.'
      )
    ),
    s(
      'Account Registration',
      p(
        'Some features, including checkout and order history, require an account. When you register, you agree to provide accurate and current information and to keep it up to date.'
      ),
      p(
        'You are responsible for keeping your password confidential and for activity that takes place under your account. Please tell us promptly if you believe your account has been used without your permission.'
      ),
      p(
        'Your email address is your sign-in identifier. If you change it in your account, the previous address stops working for sign-in immediately.'
      )
    ),
    s(
      'Product Information',
      p(
        'We describe our products as accurately as we reasonably can. Photographs, illustrations and on-screen colours are indicative and packaging may be updated from time to time.'
      ),
      p(
        'Ingredients, allergen information, nutritional information, net quantity, batch details and best-before dates printed on the product packaging are the authoritative source. Please read the pack before consuming a product, particularly if you have an allergy or a dietary restriction.'
      )
    ),
    s(
      'Pricing',
      ul(
        li('All prices are listed in Indian Rupees (INR).'),
        li('Maximum retail price, discounts and offers may be displayed alongside a product.'),
        li('Applicable taxes may be shown separately or included in the displayed price.'),
        li(
          'The final amount payable, including any delivery charges, is shown to you at checkout before you pay.'
        ),
        li('Prices and offers may change at any time before an order is placed.')
      ),
      p(
        'Despite our best efforts, a product may occasionally be listed at an incorrect price because of a genuine error. Where this happens, we may cancel the affected order and refund any amount already paid, rather than supply at the incorrect price. We will tell you if this occurs.'
      )
    ),
    s(
      'Product Availability',
      p(
        'All products are offered subject to availability. Stock shown on the website may change between the time you add an item to your cart and the time your order is confirmed.'
      ),
      p(
        'If a product becomes unavailable after you have paid, we will contact you and arrange a refund for that item, or another resolution agreed with you.'
      )
    ),
    s(
      'Orders',
      p(
        'Placing an order is an offer to buy the products in your cart on these terms. A contract is formed when we confirm the order.'
      ),
      p(
        'We may decline or cancel an order, in whole or in part, where a product is unavailable, where the price or product listing contained a genuine error, where the delivery address is not serviceable, where payment cannot be confirmed, or where we reasonably suspect fraudulent or abusive use. Any amount already paid for a declined order is refunded.'
      )
    ),
    s(
      'Payments',
      p(
        'Payments on this website are processed through ',
        bold('Razorpay'),
        ', an authorised third-party payment provider. Your payment details are entered on Razorpay’s payment interface and are handled by Razorpay under its own terms and privacy policy.'
      ),
      p(
        'We do not receive or store your full card number, CVV, UPI PIN or net-banking credentials. What we receive from Razorpay is limited transaction information such as a payment or order reference, the amount, the payment status and the payment method used, which we use to confirm and support your order.'
      ),
      p(
        'An order is treated as confirmed once payment is successfully verified. Where a payment fails, is not verified, or appears to have been charged without an order being confirmed, please see the ',
        link('/refund-policy', 'Cancellation, Return & Refund Policy'),
        ' and contact us.'
      )
    ),
    s(
      'Order Cancellation',
      p('Orders may be cancelled within {{cancellationWindow}}, provided the order has not been dispatched.'),
      p(
        'Once an order has been handed to a courier it can no longer be cancelled, though it may still be eligible for a resolution under the ',
        link('/refund-policy', 'Cancellation, Return & Refund Policy'),
        '.'
      ),
      p('Full details, including how a cancellation is refunded, are set out in that policy.')
    ),
    s(
      'Shipping & Delivery',
      p(
        'Delivery is available to serviceable pin codes. Serviceability is checked during checkout, and an address we cannot deliver to will be identified before you pay.'
      ),
      p(
        'Orders are usually dispatched within {{dispatchTimeline}} and delivered within {{estimatedDeliveryTimeline}}. These are estimates and not guaranteed delivery dates.'
      ),
      p('Full details are set out in the ', link('/shipping-policy', 'Shipping & Delivery Policy'), '.')
    ),
    s(
      'Returns & Refunds',
      p(
        'Our products are packaged food items. For reasons of hygiene, safety and food traceability, we are generally unable to accept returns of delivered products simply because you have changed your mind.'
      ),
      p('This does not affect your ability to report a problem with an order. You can raise an issue where:'),
      ul(
        li('the wrong item was delivered'),
        li('a product arrived damaged'),
        li('packaging was leaking, broken or tampered with'),
        li('an item was missing from the shipment'),
        li('a product is materially defective'),
        li('the order was not fulfilled correctly for another genuine reason')
      ),
      p(
        'How to report an issue, what evidence helps, and the resolutions available are set out in the ',
        link('/refund-policy', 'Cancellation, Return & Refund Policy'),
        '.'
      ),
      p(CONSUMER_RIGHTS)
    ),
    s(
      'Customer Responsibilities',
      p('To help your order arrive correctly, please:'),
      ul(
        li('provide a complete and accurate delivery address, including pin code and landmark where useful'),
        li('provide a working phone number that the courier can reach'),
        li('make sure someone is available to receive the shipment, or arrange a suitable alternative'),
        li('check the packaging on delivery and report any visible damage promptly'),
        li('store products as indicated on the pack after delivery')
      ),
      p(
        'Repeated refusal of delivery or repeatedly incorrect address details may affect our ability to accept future orders.'
      )
    ),
    s(
      'Intellectual Property',
      p(
        'The Aha Rasam name and logo, and the text, photographs, illustrations, design and other material on this website, are owned by us or used with permission and are protected by applicable intellectual property law.'
      ),
      p(
        'You may view and print pages from this website for your own personal use. You may not copy, reproduce, republish, distribute or commercially exploit any part of it without our written permission.'
      )
    ),
    s(
      'Prohibited Use',
      p('You agree not to:'),
      ul(
        li('use the website for any unlawful or fraudulent purpose'),
        li('place orders you do not intend to pay for or receive'),
        li('use another person’s payment instrument or account without authorisation'),
        li(
          'attempt to gain unauthorised access to the website, its accounts, its systems or its underlying infrastructure'
        ),
        li('interfere with the operation or security of the website'),
        li('extract or scrape content or data from the website in bulk'),
        li('misrepresent your identity or your association with any person')
      ),
      p('We may suspend or close an account that is used in these ways.')
    ),
    s(
      'Third-Party Services',
      p('We rely on established third-party providers to operate the website and fulfil orders:'),
      ul(
        li(bold('Razorpay'), ' — payment processing'),
        li(
          bold('Shiprocket and its partner courier companies'),
          ' — pin code serviceability, shipping and delivery'
        ),
        li(bold('Email service providers'), ' — transactional messages such as order and account emails'),
        li(bold('Hosting and infrastructure providers'), ' — running the website and storing its data')
      ),
      p(
        'These providers act under their own terms and privacy policies. Links or references to third-party services do not mean we control or endorse them.'
      )
    ),
    s(
      'Limitation of Liability',
      p(
        'We take reasonable care in operating this website and preparing our products, but we do not warrant that the website will be uninterrupted or error-free, or that delivery estimates will always be met.'
      ),
      p(
        'To the extent permitted by law, we are not liable for indirect or consequential loss arising from your use of the website. Where we are liable in connection with an order, our liability is limited to the amount you paid for that order.'
      ),
      p(CONSUMER_RIGHTS)
    ),
    s(
      'Changes to These Terms',
      p(
        'We may update these terms from time to time, for example to reflect changes in our products, our processes or the law. The current version is always the one published on this page, and the effective date is shown at the top.'
      ),
      p('Orders are governed by the terms in force at the time the order was placed.')
    ),
    s(
      'Governing Law',
      p('These terms are governed by the laws of India.'),
      p(
        'Subject to any right you have under consumer protection law to bring proceedings elsewhere, the courts at {{governingJurisdiction}} have jurisdiction over disputes arising from these terms.'
      )
    ),
    s(
      'Contact',
      p('For questions about these terms or about an order:'),
      ul(
        li(bold('Email: '), '{{supportEmail}}'),
        li(bold('Phone: '), '{{supportPhone}}'),
        li(bold('Address: '), '{{businessAddress}}')
      ),
      p(
        'For complaints and grievances, you can also reach our grievance officer {{grievanceOfficerName}} at {{grievanceEmail}} or {{grievancePhone}}.'
      ),
      p('You can also use the ', link(CONTACT_URL, 'contact form on our homepage'), '.')
    ),
  ],
};

// --- 2. Privacy Policy ----------------------------------------------------
const PRIVACY = {
  slug: 'privacy-policy',
  title: 'Privacy Policy',
  seoTitle: 'Privacy Policy | Aha Rasam',
  seoDescription:
    'How Aha Rasam collects, uses, shares and protects information when you browse the website, create an account or place an order.',
  intro:
    'Aha Rasam respects your privacy. This Privacy Policy explains how information may be collected, used, shared and protected when you use our website, create an account or place an order.',
  sections: [
    s(
      'Who We Are',
      p(
        'This website is operated by {{legalEntityName}}, trading as {{brandName}}, with its place of business at {{businessAddress}}.'
      ),
      p('This policy covers information handled through this website and the orders placed on it.')
    ),
    s(
      'Information We May Collect',
      p(bold('Account information')),
      ul(li('name'), li('email address'), li('phone number'), li('account settings and sign-in details')),
      p(bold('Delivery information')),
      ul(
        li('recipient name'),
        li('delivery address'),
        li('city'),
        li('state'),
        li('pin code'),
        li('contact phone number for the delivery')
      ),
      p(bold('Order information')),
      ul(
        li('products and quantities ordered'),
        li('order totals and charges'),
        li('order history'),
        li('order, payment and delivery status')
      ),
      p(bold('Payment-related information')),
      ul(
        li('payment and transaction reference identifiers'),
        li('payment status'),
        li('limited metadata supplied to us by the payment provider, such as the payment method used')
      ),
      p(
        'Card payments and UPI payments are completed on Razorpay’s payment interface. ',
        bold(
          'We do not receive or store complete card numbers, CVV codes, UPI PINs or net-banking passwords.'
        )
      ),
      p(bold('Technical information')),
      ul(
        li('IP address'),
        li('browser and device information'),
        li('server and application logs'),
        li('cookies and browser storage set by the website'),
        li('information used to detect and prevent abuse')
      ),
      p(
        'Some technical information may be collected automatically by the website and its infrastructure providers as part of normal operation.'
      )
    ),
    s(
      'How Information Is Used',
      p('Information may be used to:'),
      ul(
        li('create and maintain your account'),
        li('process and fulfil your orders'),
        li('take and verify payment through our payment provider'),
        li('arrange shipping and delivery, and handle delivery exceptions'),
        li('send transactional messages about your account and orders'),
        li('respond to your questions and provide customer support'),
        li('protect the website and our customers against fraud and abuse'),
        li('meet legal, tax and regulatory obligations'),
        li('understand problems and improve our products and service')
      ),
      p(
        'We do not sell your personal information, and we do not use it for targeted advertising or profiling.'
      )
    ),
    s(
      'Payments',
      p(
        'Payments are processed by ',
        bold('Razorpay'),
        '. When you pay, the details you enter are submitted to Razorpay, which handles them under its own terms and privacy policy.'
      ),
      p(
        'What comes back to us is limited to what we need to confirm and support the order: payment and order references, the amount, the status of the payment and the method used.'
      )
    ),
    s(
      'Shipping & Logistics',
      p(
        'To deliver an order, the recipient’s name, delivery address, pin code and contact phone number are shared with ',
        bold('Shiprocket'),
        ' and the courier company assigned to that shipment.'
      ),
      p(
        'A pin code may also be checked with Shiprocket during checkout to confirm we can deliver to it and to price the delivery.'
      ),
      p('Couriers use these details to make the delivery and to contact you about it.')
    ),
    s(
      'Email Communications',
      p(
        'We send transactional email such as account confirmations, password reset links, order confirmations and delivery updates. These are part of the service and are sent through an email service provider on our behalf.'
      ),
      p('We will not add you to marketing email without your consent.')
    ),
    s(
      'Cookies and Browser Storage',
      p(
        'The website uses cookies and browser storage, including localStorage and session storage, for functions the site needs in order to work:'
      ),
      ul(
        li('keeping you signed in after you log in'),
        li('remembering the contents of your cart between visits'),
        li('carrying your checkout details through the payment step'),
        li('protecting sessions and helping detect abuse')
      ),
      p(
        'You can clear browser storage or block cookies through your browser settings. Doing so may sign you out and empty your cart.'
      )
    ),
    s(
      'Sharing of Information',
      p('Information is shared only where it is needed to run the service:'),
      ul(
        li(bold('Razorpay'), ' — to take and verify payments'),
        li(bold('Shiprocket and partner couriers'), ' — to check serviceability and deliver orders'),
        li(bold('Email service providers'), ' — to send transactional messages'),
        li(bold('Hosting and infrastructure providers'), ' — to run and store the website and its data'),
        li(
          bold('Professional advisers and authorities'),
          ' — where required by law, or to establish, exercise or defend legal claims'
        )
      ),
      p('We do not sell or rent personal information.')
    ),
    s(
      'Data Retention',
      p(
        'Information is kept for as long as it is needed for the purpose it was collected for — for example, while your account is open, or while an order and its payment record must be retained.'
      ),
      p(
        'Order, payment and tax records are kept for as long as applicable law requires them to be kept, which may be longer than an account remains open. Information no longer needed is deleted or anonymised.'
      )
    ),
    s(
      'Security',
      p('We take reasonable technical and organisational measures to protect information, including:'),
      ul(
        li('encrypted connections (HTTPS) between your browser and our systems'),
        li('storing passwords only in hashed form, never as readable text'),
        li('leaving card and UPI credentials with our payment provider rather than handling them ourselves'),
        li('limiting access to customer and order data to those who need it'),
        li('verifying payment confirmations on our servers rather than trusting the browser')
      ),
      p(
        'No method of transmission or storage is completely secure, so we cannot guarantee absolute security. Please keep your password confidential and tell us if you suspect your account has been used without permission.'
      )
    ),
    s(
      'Customer Choices & Rights',
      p('You can:'),
      ul(
        li('view and update your name, phone number and email address in your account'),
        li('ask us what personal information we hold about you'),
        li('ask us to correct information that is inaccurate'),
        li('ask us to delete information we no longer need to keep'),
        li('raise a concern about how your information has been handled')
      ),
      p(
        'Some information must be retained even after a request — for example, records we are legally required to keep. Where that applies we will tell you.'
      ),
      p('To make a request, contact us using the details in the last section of this policy.')
    ),
    s(
      'Children’s Privacy',
      p(
        'This website is intended for use by adults. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will take appropriate steps.'
      )
    ),
    s(
      'Third-Party Links',
      p(
        'The website may link to sites we do not operate, including our payment provider and courier tracking pages. This policy does not apply to those sites, and we are not responsible for their content or their handling of your information. Please read their privacy policies.'
      )
    ),
    s(
      'Changes to This Policy',
      p(
        'We may update this policy from time to time. The current version is always the one published on this page, and the effective date is shown at the top. Where a change is significant, we will take reasonable steps to bring it to your attention.'
      )
    ),
    s(
      'Privacy / Grievance Contact',
      p('For privacy questions, requests or complaints, contact our grievance officer:'),
      ul(
        li(bold('Name: '), '{{grievanceOfficerName}}'),
        li(bold('Email: '), '{{grievanceEmail}}'),
        li(bold('Phone: '), '{{grievancePhone}}'),
        li(bold('Address: '), '{{businessAddress}}')
      ),
      p('For anything else, you can reach customer support at {{supportEmail}} or {{supportPhone}}.')
    ),
  ],
};

// --- 3. Shipping & Delivery Policy ---------------------------------------
const SHIPPING = {
  slug: 'shipping-policy',
  title: 'Shipping & Delivery Policy',
  seoTitle: 'Shipping & Delivery Policy | Aha Rasam',
  seoDescription:
    'How Aha Rasam orders are processed, dispatched and delivered, including serviceability, shipping charges, delivery estimates and what happens when a delivery fails.',
  intro:
    'This Shipping & Delivery Policy explains how orders placed through Aha Rasam are processed and delivered.',
  sections: [
    s(
      'Delivery Coverage',
      p(
        'We deliver to serviceable pin codes in India. Whether we can deliver to a particular address depends on that address’s pin code and on our courier partners’ coverage, which changes from time to time.'
      ),
      p(
        'Serviceability is checked at checkout. If your pin code cannot be served, you will be told before you pay rather than after the order is placed.'
      )
    ),
    s(
      'Shipping Partners',
      p(
        'Shipments are arranged through ',
        bold('Shiprocket'),
        ', which assigns a partner courier company to each shipment based on the destination and the shipment details.'
      ),
      p(
        'The courier that delivers your order may therefore differ from order to order. Couriers deliver under their own operating procedures.'
      )
    ),
    s(
      'Shipping Charges',
      p('{{shippingChargesPolicy}}.'),
      p(
        'Any delivery charge that applies to your order is shown as a separate line in the order summary at checkout, and is included in the total you approve before paying.'
      )
    ),
    s(
      'Order Processing & Dispatch',
      p(
        'Orders are processed once payment has been confirmed. Orders are usually dispatched within {{dispatchTimeline}}.'
      ),
      p(
        'Processing time may be longer during public holidays, festive periods, or where an order needs additional verification.'
      )
    ),
    s(
      'Estimated Delivery',
      p('Once dispatched, orders are usually delivered within {{estimatedDeliveryTimeline}}.'),
      p(
        'Delivery timelines are ',
        bold('estimates, not guarantees'),
        '. Actual delivery depends on the destination, the courier’s route and conditions outside our control such as weather, local disruptions or restricted-access locations.'
      )
    ),
    s(
      'Delivery Address',
      p(
        'Please enter a complete and accurate delivery address, including the pin code, a landmark where it helps, and a phone number the courier can reach.'
      ),
      p(
        'Once an order has been dispatched, the delivery address usually cannot be changed. If you notice a mistake, contact us immediately — we will help where the shipment has not yet moved too far, but we cannot promise a change is possible.'
      )
    ),
    s(
      'Delivery Attempts / NDR',
      p(
        bold('Non-Delivery Report (NDR)'),
        ' refers to a delivery exception where a courier could not successfully complete delivery.'
      ),
      p('This can happen where:'),
      ul(
        li('nobody was available at the address to receive the shipment'),
        li('the address was incomplete, incorrect or could not be located'),
        li('the phone number provided was unreachable'),
        li('access to the building or locality was restricted'),
        li('the recipient asked for delivery on a different date')
      ),
      p(
        'Couriers usually make more than one delivery attempt. Please respond to any call or message from the courier so that a further attempt can be made.'
      )
    ),
    s(
      'Return to Origin / RTO',
      p(
        bold('Return to Origin (RTO)'),
        ' occurs when an undelivered shipment is returned to the sender.'
      ),
      p(
        'A shipment usually goes into RTO after repeated failed delivery attempts, or where delivery was refused.'
      ),
      p(
        'If your order is returned to us, please contact us so we can arrange the next step. Whether the order is reshipped or refunded, and on what terms, is dealt with in the ',
        link('/refund-policy', 'Cancellation, Return & Refund Policy'),
        '.'
      )
    ),
    s(
      'Delayed Shipments',
      p(
        'Occasionally a shipment takes longer than its estimate. Where a delay is caused by the courier network, weather, local restrictions or other circumstances outside our control, we will follow it up with the courier on your behalf.'
      ),
      p('If your order is significantly past its estimated delivery window, please contact us.')
    ),
    s(
      'Damaged / Tampered Shipments',
      p(
        'Please check the outer packaging before accepting a delivery. If the parcel is visibly damaged, wet, leaking or appears to have been opened, you may refuse the delivery, or accept it and photograph the packaging before opening it.'
      ),
      p('Report a damaged or tampered shipment within {{issueReportingWindow}}.'),
      p(
        'Photographs of the outer packaging, the shipping label and the affected products help us resolve the issue quickly. The reporting process and the resolutions available are set out in the ',
        link('/refund-policy', 'Cancellation, Return & Refund Policy'),
        '.'
      )
    ),
    s(
      'Lost Shipments',
      p(
        'Very occasionally a shipment is lost in transit. If tracking has not moved for an unusually long time, or the courier has marked the shipment as lost, contact us and we will raise it with the courier.'
      ),
      p(
        'Once a shipment is confirmed lost, we will arrange a resolution with you — usually a reshipment or a refund, as described in the ',
        link('/refund-policy', 'Cancellation, Return & Refund Policy'),
        '.'
      )
    ),
    s(
      'Incorrect Address / Customer Unavailable',
      p(
        'Where a delivery fails because the address supplied was incomplete or incorrect, or because the recipient could not be reached across the courier’s delivery attempts, the shipment is returned to us as an RTO.'
      ),
      p(
        'Please contact us if this happens. We will confirm the correct address and discuss reshipping or refunding the order with you.'
      )
    ),
    s(
      'Order Tracking',
      p(
        'Once your order is dispatched, tracking details are shared with you by email, and by SMS where the courier provides it. You can follow the shipment on the courier’s own tracking page using that number.'
      ),
      p(
        'You can also see your orders and their current status under ',
        link('/account', 'your account'),
        '.'
      ),
      p(
        'If tracking has not updated for some time, or you have not received tracking details after dispatch, please ',
        link(CONTACT_URL, 'get in touch'),
        '.'
      )
    ),
    s(
      'Contact',
      p('For any question about shipping or a delivery:'),
      ul(
        li(bold('Email: '), '{{supportEmail}}'),
        li(bold('Phone: '), '{{supportPhone}}'),
        li(bold('Address: '), '{{businessAddress}}')
      ),
      p('Quoting your order number helps us answer faster.')
    ),
  ],
};

// --- 4. Cancellation, Return & Refund Policy -----------------------------
const REFUND = {
  slug: 'refund-policy',
  title: 'Cancellation, Return & Refund Policy',
  seoTitle: 'Cancellation, Return & Refund Policy | Aha Rasam',
  seoDescription:
    'When an Aha Rasam order can be cancelled, how to report a damaged, incorrect or missing product, and how refunds are processed.',
  intro:
    'We want orders placed with Aha Rasam to arrive correctly and in good condition. This policy explains when an order may be cancelled and how issues involving damaged, incorrect, missing or otherwise eligible products are handled.',
  sections: [
    s(
      'Order Cancellation',
      p('Orders may be cancelled within {{cancellationWindow}}, provided the order has not been dispatched.'),
      p(
        'Once a shipment has been handed to the courier, it can no longer be cancelled. If you no longer want an order that has already been dispatched, please contact us — we will tell you what is possible for that shipment.'
      ),
      p(
        'To cancel, contact us with your order number using the details at the end of this policy.'
      ),
      p(
        bold('Note: '),
        'the exact cancellation window above is being confirmed and may be updated. The version published on this page at the time you place your order is the one that applies to it.'
      )
    ),
    s(
      'Food / Consumable Products',
      p(
        'Our products are packaged food items. For reasons of hygiene, food safety and traceability, delivered products generally cannot be returned simply because you have changed your mind, and opened or partially used products cannot be returned.'
      ),
      p(
        'This is subject to applicable law and to our final published business policy, and it does not affect the issues covered in the next section — those can always be reported.'
      ),
      p(CONSUMER_RIGHTS)
    ),
    s(
      'Eligible Issues',
      p('Please report your order if:'),
      ul(
        li('you received the wrong product'),
        li('a product arrived damaged'),
        li('packaging was leaking, crushed, broken or tampered with'),
        li('an item you paid for is missing from the shipment'),
        li('a product is materially defective or unfit for consumption'),
        li('the order was not fulfilled correctly for another genuine reason')
      ),
      p('Issues such as these are what this policy exists for, and we will work with you to resolve them.')
    ),
    s(
      'Reporting an Issue',
      p('Report an eligible issue within {{issueReportingWindow}} of delivery.'),
      p('Reasonable evidence helps us resolve a claim quickly. That may include:'),
      ul(
        li('your order number'),
        li('a short description of the problem'),
        li('photographs of the affected products'),
        li('photographs of the outer packaging'),
        li('a photograph of the shipping label'),
        li('a video, where you happen to have one')
      ),
      p(
        'An unboxing video is helpful but is ',
        bold('not'),
        ' required. We will not refuse a genuine claim because you did not film opening the parcel.'
      ),
      p('Please keep the product and its packaging until the issue has been resolved.')
    ),
    s(
      'Verification',
      p(
        'Once you report an issue we review it against your order and the shipment records, and we may ask you a few follow-up questions or for an additional photograph.'
      ),
      p(
        'Where a courier is involved — for example a damaged or lost shipment — we may also raise the matter with them. We aim to complete this review promptly and will keep you informed.'
      )
    ),
    s(
      'Possible Resolutions',
      p('Depending on what happened and what is available, a resolution may take the form of:'),
      ul(
        li('a replacement of the affected product'),
        li('reshipment of the order'),
        li('a partial refund'),
        li('a full refund'),
        li('another resolution agreed with you')
      ),
      p(
        'The appropriate resolution depends on the specific issue, and is agreed with you after the review. Reporting an issue does not by itself guarantee a refund.'
      )
    ),
    s(
      'Refund Method',
      p(
        'Approved refunds are made to the original payment method used for the order, through our payment provider. We do not refund to a different account or instrument.'
      ),
      p(
        'Where the original method can no longer receive a refund, we will contact you to agree an alternative.'
      )
    ),
    s(
      'Refund Processing Timeline',
      p('Once a refund is approved, we initiate it within {{refundProcessingTimeline}}.'),
      p(
        'After we initiate a refund, your bank, card issuer or UPI provider needs additional time to credit it to your account. That part of the timeline is set by them and is outside our control.'
      )
    ),
    s(
      'Shipping Charges',
      p(
        'Where an order is cancelled before dispatch, any delivery charge paid is refunded along with the order amount.'
      ),
      p(
        'Where a refund is issued because of an eligible issue — a wrong, damaged, missing or defective product — you are not left out of pocket for the delivery charge on the affected order.'
      ),
      p(
        'How shipping charges are treated in other situations is confirmed with you as part of the resolution.'
      )
    ),
    s(
      'Failed Delivery / NDR / RTO',
      p(
        'If a courier cannot complete delivery, the shipment is recorded as a Non-Delivery Report (NDR) and, after repeated failed attempts, returned to us as a Return to Origin (RTO). Both are explained in the ',
        link('/shipping-policy', 'Shipping & Delivery Policy'),
        '.'
      ),
      p(
        'When an order comes back to us, contact us and we will arrange either a reshipment or a refund. We do not apply automatic penalties to your account for a failed delivery.'
      )
    ),
    s(
      'Refused Delivery',
      p(
        'You may refuse a delivery where the parcel is visibly damaged, wet, leaking or appears to have been opened. Please tell us that you refused it, and why, so we can resolve it as an eligible issue.'
      ),
      p(
        'Where a delivery is refused without such a reason, the shipment returns to us as an RTO and we will discuss the appropriate resolution with you.'
      )
    ),
    s(
      'Duplicate / Failed Payments',
      p('Please contact us if:'),
      ul(
        li('you appear to have been charged more than once for the same order'),
        li('an amount was debited but checkout did not complete'),
        li('an amount was debited but you did not receive an order confirmation'),
        li('the payment status shown to you looks wrong')
      ),
      p(
        'Send us the date, the amount and any payment or transaction reference you have, along with your order number if one was created. We will check it against our payment records and with our payment provider, and refund anything that was taken in error.'
      ),
      p(
        'A payment that never reached us is usually released back by your bank on its own, but tell us anyway so we can confirm what happened.'
      )
    ),
    s(
      'Refund Not Received',
      p(
        'If we have confirmed that a refund was initiated and it has not reached your account, first check with your bank, card issuer or UPI provider, quoting the refund reference we gave you — the credit is often visible on their side before it appears on a statement.'
      ),
      p('If it still has not arrived, contact us with the refund reference and we will follow it up.')
    ),
    s(
      'Consumer Rights',
      p(CONSUMER_RIGHTS),
      p(
        'If you are not satisfied with how an issue has been handled, you can escalate it to our grievance officer {{grievanceOfficerName}} at {{grievanceEmail}} or {{grievancePhone}}.'
      )
    ),
    s(
      'Contact',
      p('To cancel an order, report an issue or ask about a refund:'),
      ul(
        li(bold('Email: '), '{{supportEmail}}'),
        li(bold('Phone: '), '{{supportPhone}}'),
        li(bold('Address: '), '{{businessAddress}}')
      ),
      p(
        'Please quote your order number. You can also ',
        link(CONTACT_URL, 'get in touch through our contact form'),
        ', or see the ',
        link('/shipping-policy', 'Shipping & Delivery Policy'),
        ' for delivery questions.'
      )
    ),
  ],
};

module.exports = {
  POLICY_SETTINGS,
  POLICY_PAGES: [TERMS, PRIVACY, SHIPPING, REFUND],
};
