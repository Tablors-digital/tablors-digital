import type { SupportLanguage } from "../support/support-i18n";

export type SubscriptionLanguage = SupportLanguage;

const en = {
  heading: "Subscription", subtitle: "Your plan, billing and device allowance.",
  plan: "Plan", renewal: "Renewal", monthly: "Monthly", devices: "Devices", used: "used",
  upgrade: "Upgrade / Downgrade", renew: "Renew", addDevices: "Add devices", paymentHistory: "Payment history",
  invoice: "Invoice", date: "Date", description: "Description", amount: "Amount", status: "Status", actions: "Actions",
  paid: "Paid", failed: "Failed", pending: "Pending", download: "Download invoice", noPayments: "No payment records yet.",
  choosePlan: "Choose a plan", currentPlan: "Current plan", selectPlan: "Select plan", devicesIncluded: "devices included", month: "/ month",
  confirmPlan: "Confirm plan change", planConfirm: "Change your plan to", cancel: "Cancel", confirm: "Confirm",
  renewTitle: "Renew subscription", renewBody: "Subscription renewal requires a configured payment provider. No payment has been made.",
  addTitle: "Add devices", extraDevices: "Additional devices", newLimit: "New device allowance", addBody: "Device purchases are unavailable until subscription payments are configured. No devices have been added.",
  paymentUnavailable: "Payment provider is not configured. No charge has been made and no subscription payment was recorded.",
  successPlan: "Plan updated.", loading: "Please wait…", close: "Close", invoiceFor: "Subscription invoice", restaurant: "Restaurant", invoiceNumber: "Invoice number", generated: "Generated from the payment record", print: "Print / Save as PDF", noInvoice: "Invoice details are unavailable.",
  planChangeNote: "Plan changes update the current demo subscription only. Configure a payment provider before charging customers.",
};
const te: typeof en = {
  heading: "సబ్‌స్క్రిప్షన్", subtitle: "మీ ప్లాన్, బిల్లింగ్ మరియు డివైస్ పరిమితి.",
  plan: "ప్లాన్", renewal: "రెన్యువల్", monthly: "నెలవారీ", devices: "డివైస్‌లు", used: "ఉపయోగంలో",
  upgrade: "ప్లాన్ మార్చండి", renew: "రెన్యూ చేయండి", addDevices: "డివైస్‌లు జోడించండి", paymentHistory: "చెల్లింపు చరిత్ర",
  invoice: "ఇన్వాయిస్", date: "తేదీ", description: "వివరణ", amount: "మొత్తం", status: "స్థితి", actions: "చర్యలు",
  paid: "చెల్లించబడింది", failed: "విఫలమైంది", pending: "పెండింగ్", download: "ఇన్వాయిస్ డౌన్‌లోడ్", noPayments: "ఇంకా చెల్లింపు వివరాలు లేవు.",
  choosePlan: "ప్లాన్ ఎంచుకోండి", currentPlan: "ప్రస్తుత ప్లాన్", selectPlan: "ఈ ప్లాన్ ఎంచుకోండి", devicesIncluded: "డివైస్‌లు", month: "/ నెల",
  confirmPlan: "ప్లాన్ మార్పును నిర్ధారించండి", planConfirm: "మీ ప్లాన్‌ను దీనికి మార్చాలా", cancel: "రద్దు", confirm: "నిర్ధారించండి",
  renewTitle: "సబ్‌స్క్రిప్షన్ రెన్యువల్", renewBody: "సబ్‌స్క్రిప్షన్ రెన్యువల్‌కు చెల్లింపు ప్రొవైడర్ అవసరం. ఎలాంటి చెల్లింపు జరగలేదు.",
  addTitle: "డివైస్‌లు జోడించండి", extraDevices: "అదనపు డివైస్‌లు", newLimit: "కొత్త డివైస్ పరిమితి", addBody: "చెల్లింపు సదుపాయం ఏర్పాటు చేసే వరకు డివైస్‌ల కొనుగోలు అందుబాటులో ఉండదు. డివైస్‌లు జోడించబడలేదు.",
  paymentUnavailable: "చెల్లింపు ప్రొవైడర్ ఏర్పాటు కాలేదు. ఎలాంటి ఛార్జీ లేదా చెల్లింపు నమోదు కాలేదు.",
  successPlan: "ప్లాన్ అప్‌డేట్ అయింది.", loading: "దయచేసి వేచి ఉండండి…", close: "మూసివేయండి", invoiceFor: "సబ్‌స్క్రిప్షన్ ఇన్వాయిస్", restaurant: "రెస్టారెంట్", invoiceNumber: "ఇన్వాయిస్ నంబర్", generated: "చెల్లింపు రికార్డు ఆధారంగా రూపొందించబడింది", print: "ప్రింట్ / PDFగా సేవ్", noInvoice: "ఇన్వాయిస్ వివరాలు అందుబాటులో లేవు.",
  planChangeNote: "ప్లాన్ మార్పులు ప్రస్తుత డెమో సబ్‌స్క్రిప్షన్‌ను మాత్రమే అప్‌డేట్ చేస్తాయి. చెల్లింపులకు ముందు ప్రొవైడర్‌ను ఏర్పాటు చేయండి.",
};
const hi: typeof en = {
  heading: "सदस्यता", subtitle: "आपका प्लान, बिलिंग और डिवाइस सीमा।",
  plan: "प्लान", renewal: "नवीनीकरण", monthly: "मासिक", devices: "डिवाइस", used: "उपयोग में",
  upgrade: "प्लान बदलें", renew: "नवीनीकरण करें", addDevices: "डिवाइस जोड़ें", paymentHistory: "भुगतान इतिहास",
  invoice: "इनवॉइस", date: "तारीख़", description: "विवरण", amount: "राशि", status: "स्थिति", actions: "कार्रवाई",
  paid: "भुगतान हुआ", failed: "विफल", pending: "लंबित", download: "इनवॉइस डाउनलोड करें", noPayments: "अभी कोई भुगतान रिकॉर्ड नहीं है।",
  choosePlan: "प्लान चुनें", currentPlan: "वर्तमान प्लान", selectPlan: "यह प्लान चुनें", devicesIncluded: "डिवाइस शामिल", month: "/ माह",
  confirmPlan: "प्लान बदलाव की पुष्टि करें", planConfirm: "क्या आप अपना प्लान बदलकर यह करना चाहते हैं", cancel: "रद्द करें", confirm: "पुष्टि करें",
  renewTitle: "सदस्यता नवीनीकरण", renewBody: "सदस्यता नवीनीकरण के लिए भुगतान प्रदाता सेट करना आवश्यक है। कोई भुगतान नहीं हुआ है।",
  addTitle: "डिवाइस जोड़ें", extraDevices: "अतिरिक्त डिवाइस", newLimit: "नई डिवाइस सीमा", addBody: "भुगतान सेटअप होने तक डिवाइस खरीद उपलब्ध नहीं है। कोई डिवाइस नहीं जोड़ा गया।",
  paymentUnavailable: "भुगतान प्रदाता सेट नहीं है। कोई शुल्क नहीं लिया गया और कोई भुगतान दर्ज नहीं हुआ।",
  successPlan: "प्लान अपडेट हो गया।", loading: "कृपया प्रतीक्षा करें…", close: "बंद करें", invoiceFor: "सदस्यता इनवॉइस", restaurant: "रेस्टोरेंट", invoiceNumber: "इनवॉइस नंबर", generated: "भुगतान रिकॉर्ड से बनाया गया", print: "प्रिंट / PDF के रूप में सेव", noInvoice: "इनवॉइस विवरण उपलब्ध नहीं हैं।",
  planChangeNote: "प्लान बदलाव केवल मौजूदा डेमो सदस्यता अपडेट करता है। भुगतान लेने से पहले प्रदाता सेट करें।",
};
export const SUBSCRIPTION_STRINGS: Record<SubscriptionLanguage, typeof en> = { en, te, hi };
export const SUBSCRIPTION_LOCALES: Record<SubscriptionLanguage, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };
