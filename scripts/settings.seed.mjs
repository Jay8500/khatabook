// Source of truth for the initial app_settings rows. Generates:
//   <migration file passed as argv[2]>  all settings, roles, default plan
//   public/config/bootstrap.json        public settings only (offline / first paint)
// Run: node scripts/settings.seed.mjs supabase/migrations/<timestamp>_settings.sql
// The SQL is idempotent: existing settings are left alone, except that new keys are
// merged into the text maps (MERGE_KEYS). Generate a new migration whenever keys are added.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const labels = {
  'app.logoAlt': 'Logo',
  'footer.poweredBy': 'Powered by',
  'network.online': 'Online',
  'network.offline': 'Offline',
  'theme.toggle': 'Toggle dark mode',
  'toast.dismiss': 'Dismiss',

  'nav.home': 'Home',
  'nav.stocks': 'Stock',
  'nav.purchases': 'Purchases',
  'nav.vendors': 'Vendors',
  'nav.reminders': 'Reminders',
  'nav.support': 'Support',
  'nav.admin': 'Admin',
  'nav.logout': 'Log out',

  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.search': 'Search…',
  'common.actions': 'Actions',
  'common.empty': 'Nothing here yet.',
  'common.loading': 'Please wait…',
  'common.confirmDelete': 'Delete this item? This cannot be undone.',
  'common.viewAll': 'View all',

  'login.title': 'Login',
  'login.subtitle': 'Enter your mobile number. We will send you a one-time code.',
  'login.phone': 'Mobile number',
  'login.phonePlaceholder': '98765 43210',
  'login.sendOtp': 'Send OTP',
  'login.otpSentTo': 'Code sent to {phone}',
  'login.otp': 'OTP',
  'login.verify': 'Verify & continue',
  'login.changePhone': 'Change number',
  'login.resend': 'Resend OTP',

  'onboarding.title': 'Set up your account',
  'onboarding.subtitle': 'Choose a username and name your shop.',
  'onboarding.username': 'Username',
  'onboarding.shopName': 'Shop name',
  'onboarding.submit': 'Continue',

  'home.greeting': 'Namaskaram, {name}!',
  'home.validTill': 'valid till {date}',
  'home.stocks': 'Products',
  'home.lowStockCount': 'Low stock',
  'home.vendors': 'Vendors',
  'home.lowStock': 'Low stock reminders',
  'home.noReminders': 'All stock levels are fine.',
  'home.createShop': 'Create your shop to get started →',
  'home.whatsappSupport': 'Chat with support on WhatsApp',
  'home.raiseTicket': 'Raise a support ticket',

  'stocks.title': 'Stock',
  'stocks.product_name': 'Product',
  'stocks.qty': 'Quantity',
  'stocks.unit': 'Unit',
  'stocks.low_stock_threshold': 'Low stock limit',

  'vendors.title': 'Vendors',
  'vendors.name': 'Name',
  'vendors.phone': 'Phone',
  'vendors.location': 'Location',

  'reminders.title': 'Reminders',
  'reminders.reminder_date': 'Date',
  'reminders.message': 'Message',
  'reminders.is_read': 'Read',
  'reminders.markRead': 'Mark read',

  'purchases.title': 'Purchases',
  'purchases.purchase_date': 'Date',
  'purchases.vendor_id': 'Vendor',
  'purchases.total_price': 'Total',
  'purchases.scan': 'Add bill',
  'purchases.photo': 'Bill photo',
  'purchases.photoHint': 'Tap to take or choose a photo',
  'purchases.scanQr': 'Scan bill QR',
  'purchases.stopQr': 'Stop scanning',
  'purchases.qrRead': 'QR captured',
  'purchases.items': 'Items',
  'purchases.itemName': 'Item',
  'purchases.itemQty': 'Qty',
  'purchases.itemRate': 'Rate',
  'purchases.addItem': 'Add item',
  'purchases.subtotal': 'Subtotal',

  'support.title': 'Support tickets',
  'support.created_at': 'Date',
  'support.issue_type': 'Issue',
  'support.description': 'Details',
  'support.status': 'Status',

  'admin.settings': 'Settings',
  'admin.adminPhones': 'Admin phones',
  'admin.messages': 'Texts & messages',
  'admin.roles': 'Roles',
  'admin.pricing': 'Pricing plans',
  'admin.shops': 'Shops',
  'admin.users': 'Users',
  'admin.tickets': 'Tickets',

  'settings.title': 'Settings',
  'settings.key': 'Key',
  'settings.value': 'Value (JSON)',
  'settings.visibility': 'Visible to',
  'settings.description': 'Description',
  'settings.visibility.public': 'Everyone',
  'settings.visibility.authenticated': 'Signed-in users',
  'settings.visibility.admin': 'Admins only',

  'roles.title': 'Roles',
  'roles.name': 'Name',
  'roles.description': 'Description',
  'roles.permissions': 'Permissions (JSON)',

  'pricing.title': 'Pricing plans',
  'pricing.name': 'Plan',
  'pricing.price': 'Price',
  'pricing.duration_days': 'Days',
  'pricing.features': 'Features (JSON list)',
  'pricing.is_active': 'Active',
  'pricing.sort_order': 'Order',

  'shops.title': 'Shops',
  'shops.name': 'Shop',
  'shops.subscription_plan_id': 'Plan',
  'shops.subscription_expires_at': 'Valid till',
  'shops.is_test': 'Test',
  'shops.created_at': 'Created',

  'users.title': 'Users',
  'users.phone': 'Phone',
  'users.username': 'Username',
  'users.role_id': 'Role',
  'users.shop_id': 'Shop',
  'users.is_test': 'Test',

  'tickets.title': 'Support tickets',
  'tickets.created_at': 'Date',
  'tickets.issue_type': 'Issue',
  'tickets.description': 'Details',
  'tickets.status': 'Status',

  'adminPhones.title': 'Admin phones',
  'adminPhones.hint': 'People logging in with these numbers get the admin role. Changes apply immediately.',
  'adminPhones.placeholder': 'Mobile number',
  'adminPhones.removeSelf': 'This is your own number. You will lose admin access. Continue?',

  'profile.open': 'Open profile',
  'profile.title': 'My profile',
  'profile.changePhoto': 'Change photo',
  'profile.username': 'Username',
  'profile.name': 'Your name',
  'profile.phone': 'Mobile',
  'profile.shop': 'Shop',
  'profile.role': 'Role',
  'profile.plan': 'Plan',
  'profile.validTill': 'Valid till',
  'profile.support': 'Need help?',
  'profile.supportHint': 'Chat with us on WhatsApp. We usually reply within a few hours.',
  'profile.whatsapp': 'Chat on WhatsApp',
  'profile.whatsappText': 'Hi, I need help with Khata. Username: {username}, Shop: {shop}',
  'profile.ticket': 'Raise a support ticket',
  'profile.logout': 'Log out',
  'profile.version': 'Version {version}',

  // Page explanations (shown under each title)
  'settings.hint': 'These control how the app works for everyone. Tap a setting to change it; changes apply right away.',
  'messages.hint': 'Every word in the app comes from here. Tap a text to change it; use the chips to add details like the product name. Changes apply for everyone right away.',
  'roles.hint': 'A role is a set of permissions. Numbers in Admin phones get the admin role, everyone else the customer role. Permissions decide which tabs a person sees.',
  'pricing.hint': 'Plans a shop can be on. New shops start on the plan named in Settings → Plan for new shops.',
  'shops.hint': 'Every customer shop. Change a shop\'s plan or extend its "valid till" date here.',
  'users.hint': 'Everyone who has logged in. You can change a person\'s role or shop.',
  'tickets.hint': 'Support tickets from customers. Update the status as you work on them.',
  'stocks.hint': 'Your products and quantities. When a quantity drops to its low-stock limit, you get a reminder.',
  'vendors.hint': 'People and companies you buy from.',
  'reminders.hint': 'Products at or below their low-stock limit. The app checks every day at the reminder time; tap "Check stock now" to check immediately.',
  'reminders.checkNow': 'Check stock now',
  'support.hint': 'Tell us about a problem. We reply and update the status here.',

  // Settings screen
  'settings.category.general': 'General',
  'settings.category.business': 'Business',
  'settings.category.login': 'Login & SMS',
  'settings.category.appearance': 'Look & feel',
  'settings.category.advanced': 'Advanced (technical)',
  'settings.showAdvanced': 'Show',
  'settings.hideAdvanced': 'Hide',
  'settings.on': 'On',
  'settings.off': 'Off',
  'settings.empty': '(empty)',
  'settings.items': '{count} values',
  'settings.itemPlaceholder': 'New item',
  'settings.json': 'Value (JSON, for technical users)',
  'settings.whoSees': 'Who receives this setting',
  'settings.choice.light': 'Light',
  'settings.choice.dark': 'Dark',
  'settings.choice.system': 'Same as phone',
  'settings.mode.light': 'Light mode',
  'settings.mode.dark': 'Dark mode',

  // Texts & messages groups (first part of each key)
  'messages.group.app': 'Header & logo',
  'messages.group.footer': 'Footer',
  'messages.group.network': 'Online status',
  'messages.group.theme': 'Dark mode button',
  'messages.group.toast': 'Pop-up close button',
  'messages.group.nav': 'Menu',
  'messages.group.common': 'Common buttons & words',
  'messages.group.login': 'Login screen',
  'messages.group.onboarding': 'First-time setup',
  'messages.group.home': 'Home screen',
  'messages.group.stocks': 'Stock screen',
  'messages.group.vendors': 'Vendors screen',
  'messages.group.reminders': 'Reminders screen',
  'messages.group.purchases': 'Purchases screen',
  'messages.group.support': 'Support screen',
  'messages.group.profile': 'Profile screen',
  'messages.group.admin': 'Admin menu',
  'messages.group.settings': 'Settings screen',
  'messages.group.settingName': 'Setting names',
  'messages.group.roles': 'Roles screen',
  'messages.group.pricing': 'Pricing screen',
  'messages.group.shops': 'Shops screen',
  'messages.group.users': 'Users screen',
  'messages.group.tickets': 'Tickets screen',
  'messages.group.adminPhones': 'Admin phones screen',
  'messages.group.messages': 'Texts & messages screen',
  'messages.group.other': 'Other',

  'update.available': 'A new version of the app is ready.',
  'update.now': 'Update',
  'admin.loginCodes': 'Login codes',
  'loginCodes.title': 'Login codes',
  'loginCodes.hint': 'When someone taps Send OTP, their code shows here. Tap "Send on WhatsApp" to send it to them. Codes disappear after they log in or when they expire.',
  'loginCodes.empty': 'No one is waiting for a code right now.',
  'loginCodes.whatsapp': 'Send on WhatsApp',
  'loginCodes.copy': 'Copy code',
  'loginCodes.expiresIn': 'Expires in {minutes} min',
  'loginCodes.expiringSoon': 'Expires in less than a minute',
  'login.otpHint': 'Your code will arrive on SMS or WhatsApp in a minute.',
  'messages.group.loginCodes': 'Login codes screen',
  // ---- Store, cart, orders (Phase 3A) ----
  'nav.orders': 'Orders',
  'nav.myOrders': 'My orders',
  'nav.shops': 'Shops',
  'nav.myStore': 'My store',

  'onboarding.customerSubtitle': 'Tell the shop your name.',
  'onboarding.yourName': 'Your name',

  'store.notFound': 'This shop link is not valid.',
  'store.closed': 'This shop is not taking orders right now.',
  'store.pickup': 'Store pickup',
  'store.delivery': 'Home delivery',
  'store.minOrder': 'Min order {amount}',
  'store.search': 'Search items…',
  'store.all': 'All',
  'store.noItems': 'No items found.',
  'store.cartBar': '{count} items in cart',
  'store.outOfStock': 'Out of stock',
  'store.onlyLeft': 'Only {count} left',
  'store.inStock': 'In stock',
  'store.add': 'Add',
  'store.less': 'Less',
  'store.more': 'More',

  'cart.title': 'Your cart',
  'cart.empty': 'Your cart is empty.',
  'cart.browse': 'Browse items',
  'cart.swipeHint': 'Swipe an item left to remove it',
  'cart.remove': 'Remove',
  'cart.howToGet': 'How do you want it?',
  'cart.free': 'Free',
  'cart.atShop': 'Collect at the shop',
  'cart.address': 'Delivery address (house, street, landmark)',
  'cart.note': 'Note for the shop (optional)',
  'cart.items': '{count} items',
  'cart.deliveryCharge': 'Delivery',
  'cart.total': 'Total',
  'cart.belowMin': 'Minimum order is {amount}.',
  'cart.payLater': 'No payment now. The shop confirms your order first and tells you how to pay.',
  'cart.request': 'Request order',

  'join.title': 'Join a shop',
  'join.hint': 'Enter the shop code or the shop phone number.',
  'join.placeholder': 'Code or phone',
  'join.find': 'Find shop',

  'orders.greeting': 'Hi {name}!',
  'orders.myShops': 'My shops',
  'orders.noShops': 'Open a shop link or enter a shop code to start ordering.',
  'orders.myTitle': 'My orders',
  'orders.none': 'No orders yet.',
  'orders.shopTitle': 'Orders',
  'orders.shopHint': 'Order requests from your customers. New ones need your OK.',
  'orders.emptyTab': 'No orders here.',
  'orders.orderNo': 'Order #{no}',
  'orders.notFound': 'Order not found.',
  'orders.tab.new': 'New',
  'orders.tab.accepted': 'Accepted',
  'orders.tab.packed': 'Packed',
  'orders.tab.ready': 'Ready',
  'orders.tab.completed': 'Done',
  'orders.tab.closed': 'Closed',
  'orders.reviewTitle': 'New request',
  'orders.reviewHint': 'Lower a quantity if you have less. Choose how the customer pays.',
  'orders.asked': 'Asked {qty} {unit}',
  'orders.paymentTitle': 'Payment',
  'orders.advanceAmount': 'Advance amount (₹)',
  'orders.remarkForCustomer': 'Remark for the customer (optional)',
  'orders.accept': 'Accept',
  'orders.reject': 'Reject',
  'orders.subtotal': 'Items',
  'orders.paid': 'Paid',
  'orders.balance': 'Balance',
  'orders.terms.full': 'Pay the full {amount} before pickup/delivery.',
  'orders.terms.advance': 'Pay {amount} advance now, {balance} on pickup/delivery.',
  'orders.terms.cod': 'Pay {amount} on pickup/delivery (cash or UPI).',
  'orders.waitingConfirm': 'Thanks! The shop will confirm your payment.',
  'orders.payUpi': 'Pay {amount} with UPI',
  'orders.scanToPay': 'Scan with any UPI app',
  'orders.afterPaying': 'After paying, tell the shop:',
  'orders.utr': 'UPI reference / UTR (optional)',
  'orders.iHavePaid': 'I have paid',
  'orders.noUpi': 'The shop will tell you how to pay.',
  'orders.markReceived': 'Mark received',
  'orders.customerRef': 'Customer reference: {ref}',
  'orders.mark.packed': 'Mark packed',
  'orders.mark.completed': 'Mark completed',
  'orders.mark.cancelled': 'Cancel order',
  'orders.markReady.pickup': 'Ready for pickup',
  'orders.markReady.delivery': 'Out for delivery',
  'orders.whatsappCustomer': 'WhatsApp customer',
  'orders.whatsappShop': 'WhatsApp shop',
  'orders.cancelMine': 'Cancel my order',
  'orders.confirmCancel': 'Cancel this order?',
  'orders.timeline': 'What happened',
  'orders.note': 'Note',
  'orders.addNote': 'Add a note…',
  'orders.send': 'Send',
  'orders.byYou': 'You',
  'orders.byShop': 'Shop',
  'orders.byCustomer': 'Customer',

  'orderStatus.requested': 'Requested',
  'orderStatus.accepted': 'Accepted',
  'orderStatus.packed': 'Packed',
  'orderStatus.ready': 'Ready',
  'orderStatus.ready.pickup': 'Ready for pickup',
  'orderStatus.ready.delivery': 'Out for delivery',
  'orderStatus.completed': 'Completed',
  'orderStatus.rejected': 'Rejected',
  'orderStatus.cancelled': 'Cancelled',
  'paymentMode.full': 'Full payment',
  'paymentMode.advance': 'Advance',
  'paymentMode.cod': 'Pay later / COD',
  'paymentStatus.unpaid': 'Not paid',
  'paymentStatus.pending_verification': 'Paid? Check',
  'paymentStatus.partially_paid': 'Part paid',
  'paymentStatus.paid': 'Paid',

  'myStore.title': 'My store',
  'myStore.hint': 'Your online shop. Share the link or code; customers order from home.',
  'myStore.shareTitle': 'Share your store',
  'myStore.code': 'Shop code',
  'myStore.copy': 'Copy link',
  'myStore.shareWhatsapp': 'Share on WhatsApp',
  'myStore.downloadQr': 'Download QR to print',
  'myStore.shareText': 'Order from {shop} on your phone: {link} (shop code {code})',
  'myStore.basics': 'Store',
  'myStore.open': 'Taking orders',
  'myStore.openHint': 'Turn off to pause new orders.',
  'myStore.name': 'Shop name',
  'myStore.slug': 'Link name (khata.spreadapps.in/s/…)',
  'myStore.note': 'Message on your store',
  'myStore.notePlaceholder': 'e.g. Open 8 AM – 9 PM',
  'myStore.address': 'Shop address',
  'myStore.phone': 'Shop WhatsApp number',
  'myStore.fulfilment': 'Pickup & delivery',
  'myStore.deliveryCharge': 'Delivery charge (₹)',
  'myStore.deliveryNote': 'Delivery areas / timing',
  'myStore.deliveryNotePlaceholder': 'e.g. Within 3 km, 5–8 PM',
  'myStore.minOrder': 'Minimum order (₹)',
  'myStore.payments': 'Payments',
  'myStore.upiId': 'UPI ID',
  'myStore.upiName': 'Name on UPI',
  'myStore.defaultPayment': 'Usual payment for orders',
  'myStore.advancePercent': 'Advance percent (%)',

  'stocks.image_url': 'Photo',
  'stocks.price': 'Price',
  'stocks.category': 'Category',
  'stocks.show_in_store': 'In store',
  'stocks.reserved_qty': 'Reserved',
  'stocks.description': 'Description',

  'messages.ORDER_WHATSAPP': 'Order WhatsApp',
  'messages.ORDER_TEXTS': 'Order notes',
  'messages.group.store': 'Store screen',
  'messages.group.cart': 'Cart screen',
  'messages.group.join': 'Join shop screen',
  'messages.group.orders': 'Order screens',
  'messages.group.orderStatus': 'Order statuses',
  'messages.group.paymentMode': 'Payment types',
  'messages.group.paymentStatus': 'Payment statuses',
  'messages.group.myStore': 'My store screen',
  'messages.group.update': 'Update banner',

  'messages.editTitle': 'Change text',
  'template.insert': 'Tap to add a detail:',
  'template.preview': 'Preview',
  'nav.more': 'More',

  'messages.title': 'Texts & messages',
  'messages.UI_LABELS': 'Screen labels',
  'messages.TOAST_MESSAGES': 'Pop-up messages',
  'messages.REMINDER_MESSAGES': 'Reminder texts',
  'messages.newKey': 'New key',
  'messages.newValue': 'Text',
  'messages.discard': 'Discard unsaved changes?',
};

const toasts = {
  test: 'Everything is wired up.',
  offline: 'You are offline. Changes will sync when you reconnect.',
  online: 'Back online.',
  otpSent: 'OTP sent.',
  loginSuccess: 'Welcome!',
  loginFailed: 'Wrong or expired OTP. Try again.',
  logout: 'Logged out.',
  onboardingDone: 'All set!',
  username_taken: 'That username is taken. Try another.',
  saved: 'Saved.',
  deleted: 'Deleted.',
  error: 'Something went wrong. Please try again.',
  required: 'Please fill all required fields.',
  invalidJson: 'Value is not valid JSON.',
  permissionDenied: 'You do not have access to that page.',
  qrRead: 'QR code read.',
  scanSaved: 'Bill saved.',
  scanFailed: 'Could not save the bill.',
  adminPhonesEmpty: 'Keep at least one admin phone.',
  photoUpdated: 'Profile photo updated.',
  photoFailed: 'Could not upload the photo.',
  photoType: 'Please choose a {types} photo.',
  photoTooBig: 'That photo is too big. Choose one under {mb} MB.',
  remindersChecked: '{count} new reminder(s) created.',
  invalidPhone: 'Enter a valid {digits}-digit mobile number.',
  codeCopied: 'Code copied.',
  newLoginCode: 'New login code for {phone}. Open Admin → Login codes.',
  invalidOtpLength: 'Enter the {digits}-digit code.',
  otpSendFailed: 'Could not send the code. Please try again.',
  'auth.otp_expired': 'Wrong or expired code. Check it and try again.',
  'auth.over_sms_send_rate_limit': 'Please wait a few seconds before asking for a new code.',
  'auth.over_request_rate_limit': 'Too many tries. Please wait a minute and try again.',
  'auth.sms_send_failed': 'Could not send the code. Please try again.',
  noNewReminders: 'No new reminders. Stock looks fine.',
  newOrder: 'New order request! {count} waiting in Orders.',
  orderPlaced: 'Order sent to the shop. You will see updates here.',
  loginToOrder: 'Login with your mobile number to send the order. Your cart is saved.',
  orderAccepted: 'Order accepted. Stock reserved.',
  orderUpdated: 'Order updated.',
  paymentConfirmed: 'Payment recorded.',
  paymentReported: 'Thanks! The shop will check your payment.',
  noteAdded: 'Note added.',
  remarkRequired: 'Please add a remark (reason) first.',
  shopNotFound: 'No shop found with that code or number.',
  linkCopied: 'Link copied.',
  pickOneFulfilment: 'Turn on pickup or delivery (at least one).',
  slugTaken: 'That link name is taken. Try another.',
  // Database error codes
  store_closed: 'This shop is not taking orders right now.',
  fulfilment_unavailable: 'That option is not available for this shop.',
  address_required: 'Please enter the delivery address.',
  cart_empty: 'Your cart is empty.',
  item_unavailable: 'An item is no longer available. Please check your cart.',
  invalid_quantity: 'Please check the quantities.',
  not_enough_stock: 'Not enough stock for an item. Quantities were updated; please check.',
  below_min_order: 'The order is below the minimum amount.',
  cannot_cancel: 'This order can no longer be cancelled here. Please contact the shop.',
  invalid_status: 'This order was already updated. Refreshing…',
  nothing_accepted: 'Accept at least one item, or reject the order.',
  invalid_amount: 'Please enter an amount.',
  not_found: 'Not found.',
};

// Spread Apps teal (brand dots: #0E9E86, #3BC9B0, #8FE3D6).
const theme = {
  light: {
    primary: '#0E9E86', onPrimary: '#FFFFFF', background: '#F3FAF8', surface: '#FFFFFF',
    border: '#D3EAE4', text: '#0F2A26', muted: '#5C7A74',
    success: '#16A34A', error: '#DC2626', warning: '#D97706', info: '#2563EB',
  },
  dark: {
    primary: '#3BC9B0', onPrimary: '#04201B', background: '#0A1614', surface: '#11211E',
    border: '#1F3833', text: '#E4F4F0', muted: '#8DB0A9',
    success: '#4ADE80', error: '#F87171', warning: '#FBBF24', info: '#60A5FA',
  },
};

// Earlier default values. If a setting still holds one of these (no admin edit), it is
// switched to the current default.
const PREVIOUS_DEFAULTS = {
  MESSAGE_SETTINGS: [['UI_LABELS', 'TOAST_MESSAGES', 'REMINDER_MESSAGES']],
  LOGIN_CODE_MINUTES: [5],
  AVATAR_IMAGE: [{ max_px: 512, quality: 0.85 }],
  SMS_PROVIDER: [{ provider: 'log' }],
  THEME_COLORS: [
    {
      light: {
        primary: '#FFC107', onPrimary: '#1F1300', background: '#FFF8E1', surface: '#FFFFFF',
        border: '#F3E3B5', text: '#3E2723', muted: '#8D6E63',
        success: '#2E7D32', error: '#C62828', warning: '#EF6C00', info: '#1565C0',
      },
      dark: {
        primary: '#FFC107', onPrimary: '#1F1300', background: '#17130C', surface: '#241E14',
        border: '#3A3021', text: '#FFF8E1', muted: '#BCAAA4',
        success: '#66BB6A', error: '#EF5350', warning: '#FFA726', info: '#42A5F5',
      },
    },
  ],
};

// Earlier default wording of individual texts ("<SETTING>": { "<text key>": [old, ...] }).
// Texts still on old wording get the current wording; texts admins edited stay.
const PREVIOUS_TEXTS = {
  TOAST_MESSAGES: { photoUpdated: ['Photo updated.'], newLoginCode: ['New login code for {phone}.'] },
  UI_LABELS: {
    'messages.hint': [
      'Every word in the app comes from here. Change a text and press Save; it updates for everyone right away. Keep words in {curly brackets}: the app fills them in.',
    ],
  },
};

const orderWhatsapp = {
  accepted: 'Hi {customer}, your order #{order_no} at {shop} is accepted. Total {total}. Please pay {amount_due} now. Details: {link}',
  packed: 'Hi {customer}, your order #{order_no} at {shop} is packed. Balance {balance}. Details: {link}',
  ready_pickup: 'Hi {customer}, your order #{order_no} is ready for pickup at {shop}. Balance {balance}. Details: {link}',
  ready_delivery: 'Hi {customer}, your order #{order_no} from {shop} is out for delivery. Balance {balance}. Details: {link}',
  completed: 'Thank you {customer}! Order #{order_no} from {shop} is complete.',
  rejected: 'Sorry {customer}, {shop} could not take order #{order_no}. {remark}',
  cancelled: 'Hi {customer}, order #{order_no} at {shop} is cancelled. {remark}',
  default: 'Hi {customer}, about your order #{order_no} at {shop}: {link}',
};
const orderVars = [
  { key: 'customer', label: 'Customer name', sample: 'Ravi' },
  { key: 'shop', label: 'Shop name', sample: 'Lakshmi Kirana' },
  { key: 'order_no', label: 'Order number', sample: '12' },
  { key: 'total', label: 'Order total', sample: '₹540' },
  { key: 'amount_due', label: 'Pay now amount', sample: '₹162' },
  { key: 'balance', label: 'Balance', sample: '₹378' },
  { key: 'remark', label: 'Last remark', sample: 'Only 1 oil today' },
  { key: 'link', label: 'Order link', sample: 'khata.spreadapps.in/orders/…' },
];

// Placeholders offered as chips when editing a text ("<SETTING>.<text key>", or a setting key).
const v = (key, label, sample) => ({ key, label, sample });
const textVariables = {
  'REMINDER_MESSAGES.low_stock': [
    v('product', 'Product name', 'Sona Masoori Rice'),
    v('qty', 'Quantity left', '3'),
    v('unit', 'Unit', 'bag'),
    v('threshold', 'Low-stock limit', '5'),
  ],
  'UI_LABELS.home.greeting': [v('name', 'Username', 'Jay')],
  'UI_LABELS.home.validTill': [v('date', 'Date', '13/10/2026')],
  'UI_LABELS.login.otpSentTo': [v('phone', 'Mobile number', '+919182054065')],
  'UI_LABELS.profile.version': [v('version', 'Version', '1.2.0')],
  'UI_LABELS.profile.whatsappText': [v('username', 'Username', 'jay'), v('shop', 'Shop name', 'Lakshmi Kirana')],
  'UI_LABELS.settings.items': [v('count', 'Number', '12')],
  'TOAST_MESSAGES.remindersChecked': [v('count', 'Number of reminders', '2')],
  'UI_LABELS.loginCodes.expiresIn': [v('minutes', 'Minutes left', '4')],
  'TOAST_MESSAGES.newLoginCode': [v('phone', 'Mobile number', '+91 98765 43210')],
  'TOAST_MESSAGES.photoType': [v('types', 'Allowed types', 'JPEG, PNG, WEBP')],
  'TOAST_MESSAGES.photoTooBig': [v('mb', 'Size limit (MB)', '5')],
  'TOAST_MESSAGES.invalidPhone': [v('digits', 'Number of digits', '10')],
  'TOAST_MESSAGES.invalidOtpLength': [v('digits', 'Number of digits', '6')],
  OTP_SMS_TEMPLATE: [v('otp', 'Login code', '482913')],
  ...Object.fromEntries(Object.keys(orderWhatsapp).map((k) => [`ORDER_WHATSAPP.${k}`, orderVars])),
};

const icons = [72, 96, 128, 144, 152, 192, 384, 512]
  .map((s) => ({ src: `icons/icon-${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' }))
  .concat(
    [192, 512].map((s) => ({ src: `icons/maskable-${s}x${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'maskable' })),
  );

// [key, value, visibility, category, name, description]
// category: shown group on Admin -> Settings (SETTING_CATEGORIES); 'texts' and 'admin_phones'
// have their own screens and are not listed there.
const SETTINGS = [
  // General
  ['APP_NAME', 'Khata', 'public', 'general', 'App name', 'Name shown in the header, the browser tab and when the app is installed on a phone.'],
  ['APP_SHORT_NAME', 'Khata', 'public', 'general', 'Short name', 'Name under the app icon on the phone home screen. Keep it short.'],
  ['APP_DESCRIPTION', 'Shop khata, stock and vendor book', 'public', 'general', 'App description', 'One line about the app, shown when installing it.'],
  ['SUPPORT_WHATSAPP_NUMBER', '', 'public', 'general', 'Support WhatsApp number', 'Customers tap "Chat on WhatsApp" in their profile to message this number. Include the country code, e.g. 919876543210. Leave empty to hide the button.'],
  ['IS_TEST_MODE', true, 'authenticated', 'general', 'Test mode', 'While on, everything created is marked as test data. Turn it off before real customers start.'],
  ['LOCALE', 'en-IN', 'public', 'general', 'Number & date format', 'How dates and amounts are written. en-IN shows 13/10/2026 and ₹1,00,000.'],
  ['CURRENCY_CODE', 'INR', 'public', 'general', 'Currency', 'Currency for all prices, e.g. INR.'],
  ['TIMEZONE', 'Asia/Kolkata', 'authenticated', 'general', 'Time zone', 'Used for the daily reminder time. Asia/Kolkata for India.'],

  // Business
  ['DEFAULT_PLAN_NAME', 'Free Trial', 'admin', 'business', 'Plan for new shops', 'New shops start on the pricing plan with exactly this name (see Pricing plans).'],
  ['LOW_STOCK_DEFAULT_THRESHOLD', 5, 'authenticated', 'business', 'Default low-stock limit', 'A reminder is created when a product\'s quantity drops to this number, unless the product has its own limit.'],
  ['STOCK_REMINDER_TIME', '09:00', 'admin', 'business', 'Daily reminder time', 'Every day at this time the app checks every shop\'s stock and creates low-stock reminders.'],
  ['STORE_DEFAULTS', { pickup: true, delivery: false, payment_mode: 'full', advance_percent: 30 }, 'admin', 'business', 'New store defaults', 'Starting store settings for new shops: pickup / delivery on or off, default payment (full, advance or cod) and advance percent. Each shop can change its own in My store.'],
  ['STORE_LOW_AVAILABLE', 5, 'public', 'business', '"Only few left" limit', 'In the store, items with this many or fewer left show "Only N left".'],
  ['ISSUE_TYPES', ['Login', 'Billing', 'Stock', 'Scanner', 'Other'], 'authenticated', 'business', 'Support issue types', 'Choices customers pick from when raising a support ticket.'],
  ['TICKET_STATUSES', ['open', 'in_progress', 'resolved', 'closed'], 'authenticated', 'business', 'Ticket statuses', 'Statuses you can set on support tickets. New tickets get the first one.'],
  ['PRICE_RULES', { tax_percent: 0, round_to: 1 }, 'authenticated', 'business', 'Bill pricing rules', 'Applied when a bill is added: tax_percent is added to the total; round_to rounds the total (1 = nearest rupee).'],

  // Login
  ['DEFAULT_COUNTRY_CODE', '+91', 'public', 'login', 'Country code', 'Shown before the mobile number on the login screen, e.g. +91.'],
  ['PHONE_DIGITS', 10, 'public', 'login', 'Mobile number length', 'How many digits a mobile number has (without the country code). The login screen checks this.'],
  ['OTP_LENGTH', 6, 'public', 'login', 'Login code length', 'How many digits the login code has. Must match the OTP length in Supabase Auth settings.'],
  ['OTP_SMS_TEMPLATE', 'Your Khata login code is {otp}', 'admin', 'login', 'OTP SMS text', 'Text of the login SMS. {otp} is replaced with the code.'],
  ['SMS_PROVIDER', { provider: 'inbox' }, 'admin', 'login', 'SMS provider', 'How login codes reach customers. "inbox" = codes appear in Admin → Login codes and you send them on WhatsApp. "http" = a real SMS provider sends them automatically (set up once you have one).'],
  ['LOGIN_CODE_MINUTES', 10, 'admin', 'login', 'Login code time', 'How many minutes a code stays in Login codes. Keep it the same as the OTP expiry in Supabase Auth (10 minutes).'],
  ['LOGIN_CODE_POLL_SECONDS', 10, 'admin', 'login', 'Login code check', 'How often (seconds) the app checks for new login codes and alerts admins on any screen.'],
  ['ADMIN_ROLE_NAME', 'super_admin', 'admin', 'login', 'Admin role', 'Role given to the numbers in Admin phones.'],
  ['CUSTOMER_ROLE_NAME', 'customer', 'admin', 'login', 'Shop customer role', 'Role for people who sign up from a shop link (they can order, not run a shop).'],
  ['DEFAULT_ROLE_NAME', 'shop_owner', 'admin', 'login', 'Customer role', 'Role given to everyone else when they first log in.'],

  // Appearance
  ['DEFAULT_THEME', 'light', 'public', 'appearance', 'Default mode', 'Light or dark when someone opens the app. "system" follows the phone setting. Each person can still switch with the moon button; their choice is remembered.'],
  ['THEME_COLORS', theme, 'public', 'appearance', 'Colours', 'App colours for light and dark mode.'],
  ['APP_LOGO_URL', 'favicon.svg', 'public', 'appearance', 'Logo', 'Logo in the header: a file of the app or a web link to an image.'],
  ['BRAND', { name: 'Spread Apps', url: 'https://spreadapps.in', logoUrl: 'brand/spreadapps-logo.svg' }, 'public', 'appearance', 'Powered-by credit', 'Company name, link and logo in the "Powered by" line.'],
  ['TOAST_DURATION_MS', 3500, 'public', 'appearance', 'Pop-up duration (ms)', 'How long pop-up messages stay on screen, in milliseconds. 3500 = 3.5 seconds.'],

  // Advanced (technical; change only if you know why)
  ['APP_ICONS', icons, 'public', 'advanced', 'App icons', 'Icon files used when the app is installed.'],
  ['BILLS_BUCKET', 'bills', 'authenticated', 'advanced', 'Bill photo storage', 'Storage bucket for bill photos.'],
  ['AVATARS_BUCKET', 'avatars', 'authenticated', 'advanced', 'Profile photo storage', 'Storage bucket for profile photos.'],
  ['BILL_IMAGE', { max_px: 1600, quality: 0.8 }, 'authenticated', 'advanced', 'Bill photo size', 'Bill photos are shrunk to max_px pixels and quality (0-1) before upload.'],
  ['AVATAR_IMAGE', { max_px: 512, quality: 0.85, max_mb: 5, types: ['image/jpeg', 'image/png', 'image/webp'] }, 'authenticated', 'advanced', 'Profile photo rules', 'Allowed photo types and the largest file (max_mb). Photos are then shrunk to max_px pixels at this quality (0-1) before upload.'],
  ['PRODUCTS_BUCKET', 'products', 'authenticated', 'advanced', 'Product photo storage', 'Storage bucket for product photos.'],
  ['PRODUCT_IMAGE', { max_px: 800, quality: 0.8, max_mb: 5, types: ['image/jpeg', 'image/png', 'image/webp'] }, 'authenticated', 'advanced', 'Product photo rules', 'Allowed product photo types and largest file (max_mb); photos are shrunk to max_px before upload.'],
  ['ORDER_POLL_SECONDS', 15, 'authenticated', 'advanced', 'Order refresh', 'How often (seconds) open order screens refresh and the Orders badge updates.'],
  ['STORE_JOIN_CODE_LENGTH', 6, 'admin', 'advanced', 'Join code length', 'Length of new shop join codes.'],
  ['UPDATE_CHECK_SECONDS', 60, 'public', 'advanced', 'Update check', 'How often (seconds) an open app checks for a newly deployed version and offers to update.'],
  ['CONTEXT_REFRESH_SECONDS', 60, 'authenticated', 'advanced', 'Permission refresh', 'When the app is opened again after this many seconds, the role and permissions are reloaded.'],
  ['SETTING_CHOICES', { DEFAULT_THEME: ['light', 'dark', 'system'] }, 'admin', 'advanced', 'Setting choices', 'Settings that are picked from a fixed list instead of typed.'],
  ['QR_SCANNER', { fps: 10, qrbox: 250 }, 'authenticated', 'advanced', 'QR scanner', 'Camera frames per second and scan box size for the bill QR scanner.'],
  ['MESSAGE_SETTINGS', ['UI_LABELS', 'TOAST_MESSAGES', 'REMINDER_MESSAGES', 'ORDER_WHATSAPP', 'ORDER_TEXTS'], 'admin', 'advanced', 'Text groups', 'Which text groups appear in Texts & messages.'],
  ['SETTING_VISIBILITIES', ['public', 'authenticated', 'admin'], 'admin', 'advanced', 'Visibility choices', 'Who a setting can be sent to.'],
  ['TEXT_VARIABLES', textVariables, 'admin', 'advanced', 'Text variables', 'Details that can be added into a text (shown as chips when editing it), with an example value for the preview.'],
  ['SETTING_CATEGORIES', ['general', 'business', 'login', 'appearance', 'advanced'], 'admin', 'advanced', 'Settings groups', 'Groups on this page, in order. The last one starts collapsed.'],

  // Edited on their own screens
  ['UI_LABELS', labels, 'public', 'texts', 'Screen labels', 'Every text on screen. Edit in Texts & messages.'],
  ['TOAST_MESSAGES', toasts, 'public', 'texts', 'Pop-up messages', 'Pop-up message texts. Edit in Texts & messages.'],
  ['ORDER_WHATSAPP', orderWhatsapp, 'authenticated', 'texts', 'Order WhatsApp messages', 'Messages the shop sends from an order (WhatsApp button). Edit in Texts & messages.'],
  ['ORDER_TEXTS', { paid_by_customer: 'Customer says paid ₹', payment_received: 'Payment received ₹' }, 'authenticated', 'texts', 'Order timeline texts', 'Automatic notes in the order timeline. Edit in Texts & messages.'],
  ['REMINDER_MESSAGES', { low_stock: '{product} stock takkuva undi: {qty} {unit} (limit {threshold}). Repu order cheyali.' }, 'authenticated', 'texts', 'Reminder texts', 'Placeholders: {product} {qty} {unit} {threshold}. Edit in Texts & messages.'],
  ['ADMIN_PHONES', [], 'admin', 'admin_phones', 'Admin phones', 'Numbers that get the admin role. Edit in Admin phones.'],
];

for (const [key, , , , name] of SETTINGS) labels[`settingName.${key}`] = name;

const all = {
  can_access_admin: true,
  can_manage_settings: true,
  can_manage_roles: true,
  can_manage_pricing: true,
  can_manage_shops: true,
  can_manage_users: true,
  can_manage_support: true,
  can_manage_own_shop: true,
  can_view_login_codes: true,
  can_order: true,
};

const ROLES = [
  ['super_admin', 'Full access', all],
  ['shop_owner', 'Runs their own shop', { can_manage_own_shop: true }],
  ['staff', 'Works in a shop', { can_manage_own_shop: true }],
  ['customer', 'Orders from shops', { can_order: true }],
];

// jsonb object settings whose keys grow with the app.
const MERGE_KEYS = ['UI_LABELS', 'TOAST_MESSAGES', 'REMINDER_MESSAGES', 'ORDER_WHATSAPP', 'ORDER_TEXTS', 'TEXT_VARIABLES', 'STORE_DEFAULTS'];

// [name, price, duration_days, features, sort_order]
const PLANS = [['Free Trial', 0, 14, ['All features'], 0]];

// ---------------------------------------------------------------------------
// Every label/toast key referenced in the app must exist.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.(ts|html)$/.test(d.name) ? [`${dir}/${d.name}`] : [],
  );
}
const src = walk('src/app').map((f) => readFileSync(f, 'utf8')).join('\n');
const usedLabels = new Set([
  ...[...src.matchAll(/label\('([a-zA-Z_.]+)'/g)].map((m) => m[1]),
  ...[...src.matchAll(/label: '([a-zA-Z_.]+)'/g)].map((m) => m[1]),
  ...[...src.matchAll(/key: '(home\.[a-zA-Z_]+)'/g)].map((m) => m[1]),
]);
const usedToasts = new Set([...src.matchAll(/show\('([a-zA-Z_]+)'/g)].map((m) => m[1]));
const missing = [
  // Keys ending in '.' are prefixes of dynamic keys (e.g. 'messages.' + setting).
  ...[...usedLabels].filter((k) => !k.endsWith('.') && !(k in labels)).map((k) => `UI_LABELS.${k}`),
  ...[...usedToasts].filter((k) => !(k in toasts)).map((k) => `TOAST_MESSAGES.${k}`),
];
if (missing.length) {
  console.error('Missing keys:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const j = (v) => `${q(JSON.stringify(v))}::jsonb`;

const sql = [
  '-- Generated by scripts/settings.seed.mjs. Values are inserted only when missing',
  '-- ("on conflict do nothing"), so values admins changed are never overwritten.',
  '',
  ...ROLES.map(
    ([n, d, p]) =>
      `insert into public.roles (name, description, permissions, is_test) values (${q(n)}, ${q(d)}, ${j(p)}, false) on conflict (name) do nothing;`,
  ),
  '',
  ...PLANS.map(
    ([n, price, days, f, o]) =>
      `insert into public.pricing_plans (name, price, duration_days, features, sort_order, is_test) select ${q(n)}, ${price}, ${days}, ${j(f)}, ${o}, false where not exists (select 1 from public.pricing_plans where name = ${q(n)});`,
  ),
  '',
  ...SETTINGS.map(
    ([k, v, vis, cat, , d]) =>
      `insert into public.app_settings (key, value, visibility, category, description) values (${q(k)}, ${j(v)}, ${q(vis)}, ${q(cat)}, ${q(d)}) on conflict (key) do nothing;`,
  ),
  '',
  '-- Descriptions and groups belong to the app, so they are always refreshed.',
  ...SETTINGS.map(
    ([k, , , cat, , d]) => `update public.app_settings set category = ${q(cat)}, description = ${q(d)} where key = ${q(k)};`,
  ),
  '',
  '-- Settings still on an earlier default move to the current default.',
  ...SETTINGS.filter(([k]) => PREVIOUS_DEFAULTS[k]).flatMap(([k, v]) =>
    PREVIOUS_DEFAULTS[k].map((old) => `update public.app_settings set value = ${j(v)} where key = ${q(k)} and value = ${j(old)};`),
  ),
  '',
  '-- Texts still on earlier default wording move to the current wording.',
  ...SETTINGS.filter(([k]) => PREVIOUS_TEXTS[k]).flatMap(([k, v]) =>
    Object.entries(PREVIOUS_TEXTS[k]).flatMap(([textKey, olds]) =>
      olds.map(
        (old) =>
          `update public.app_settings set value = jsonb_set(value, ${q('{' + textKey + '}')}, ${j(v[textKey])}) where key = ${q(k)} and value ->> ${q(textKey)} = ${q(old)};`,
      ),
    ),
  ),
  '',
  '-- Text maps: add keys that are new in code; texts admins already edited win.',
  ...SETTINGS.filter(([k]) => MERGE_KEYS.includes(k)).map(
    ([k, v]) => `update public.app_settings set value = ${j(v)} || value where key = ${q(k)};`,
  ),
  '',
].join('\n');

const out = process.argv[2];
if (out) writeFileSync(out, sql);

const bootstrap = Object.fromEntries(SETTINGS.filter(([, , vis]) => vis === 'public').map(([k, v]) => [k, v]));
writeFileSync('public/config/bootstrap.json', JSON.stringify(bootstrap, null, 2) + '\n');

console.log(
  `labels ${Object.keys(labels).length} (used ${usedLabels.size}), toasts ${Object.keys(toasts).length}, settings ${SETTINGS.length}` +
    (out ? `, wrote ${out}` : ''),
);
