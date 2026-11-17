/**
 * Feedback translations (English / Telugu / Hindi). Plain module: no
 * "server-only" so both the customer device UI and the server actions can
 * share the same wording.
 */

export const FEEDBACK_LANGUAGES = ["en", "te", "hi"] as const;
export type FeedbackLanguage = (typeof FEEDBACK_LANGUAGES)[number];
export const DEFAULT_FEEDBACK_LANGUAGE: FeedbackLanguage = "en";

/** Names are always shown in their own script so a customer can find theirs. */
export const FEEDBACK_LANGUAGE_NAMES: Record<FeedbackLanguage, string> = {
  en: "English",
  te: "తెలుగు",
  hi: "हिन्दी",
};

export function isFeedbackLanguage(value: unknown): value is FeedbackLanguage {
  return typeof value === "string" && (FEEDBACK_LANGUAGES as readonly string[]).includes(value);
}

export type FeedbackStrings = {
  language: string;
  title: string;
  instruction: string;
  qOverall: string;
  qFood: string;
  qDevice: string;
  dishesHeading: string;
  dishesEmpty: string;
  submit: string;
  submitting: string;
  thanksBox: string;
  thanksToast: string;
  placeOrderFirst: string;
  answerAll: string;
  ratingOutOf: (label: string, n: number) => string;
  rateDish: (name: string) => string;
  errOrderNotFound: string;
  errNotPaid: string;
  errAlreadySubmitted: string;
  errRateAllThree: string;
  errDishRange: string;
  errDishNotOnOrder: string;
};

export const FEEDBACK_STRINGS: Record<FeedbackLanguage, FeedbackStrings> = {
  en: {
    language: "Language",
    title: "Restaurant Feedback",
    instruction: "Tap a number: 1 is poor, 10 is excellent.",
    qOverall: "How would you rate our restaurant?",
    qFood: "How was the food taste?",
    qDevice: "How easy was the ordering device to use?",
    dishesHeading: "Rate each dish (optional)",
    dishesEmpty: "Dishes you order will appear here so you can rate them one by one.",
    submit: "Submit Feedback",
    submitting: "Submitting…",
    thanksBox: "Thank you for your feedback!",
    thanksToast: "Thank you! Your feedback was submitted.",
    placeOrderFirst: "Place your order first, then rate your visit.",
    answerAll: "Please answer all three questions (1–10).",
    ratingOutOf: (label, n) => `${label}: ${n} out of 10`,
    rateDish: (name) => `Rate ${name}`,
    errOrderNotFound: "Order not found for this table.",
    errNotPaid: "This order isn't marked as paid yet.",
    errAlreadySubmitted: "Feedback has already been submitted for this order.",
    errRateAllThree: "Please rate all three questions (1–10).",
    errDishRange: "Dish ratings must be between 1 and 10.",
    errDishNotOnOrder: "A rated dish is not part of this order.",
  },
  te: {
    language: "భాష",
    title: "రెస్టారెంట్ ఫీడ్‌బ్యాక్",
    instruction: "ఒక సంఖ్యను నొక్కండి: 1 అంటే బాగోలేదు, 10 అంటే అద్భుతం.",
    qOverall: "మా రెస్టారెంట్‌కు మీరు ఎన్ని రేటింగ్ ఇస్తారు?",
    qFood: "ఆహారం రుచి ఎలా ఉంది?",
    qDevice: "ఆర్డర్ చేసే డివైస్‌ను ఉపయోగించడం ఎంత సులభంగా ఉంది?",
    dishesHeading: "ప్రతి వంటకానికి రేటింగ్ ఇవ్వండి (ఐచ్ఛికం)",
    dishesEmpty: "మీరు ఆర్డర్ చేసిన వంటకాలు ఇక్కడ కనిపిస్తాయి, వాటిని ఒక్కొక్కటిగా రేట్ చేయవచ్చు.",
    submit: "ఫీడ్‌బ్యాక్ పంపండి",
    submitting: "పంపుతోంది…",
    thanksBox: "మీ ఫీడ్‌బ్యాక్‌కు ధన్యవాదాలు!",
    thanksToast: "ధన్యవాదాలు! మీ ఫీడ్‌బ్యాక్ పంపబడింది.",
    placeOrderFirst: "ముందుగా ఆర్డర్ చేయండి, ఆ తర్వాత మీ అనుభవానికి రేటింగ్ ఇవ్వండి.",
    answerAll: "దయచేసి మూడు ప్రశ్నలకూ (1–10) సమాధానం ఇవ్వండి.",
    ratingOutOf: (label, n) => `${label}: 10 లో ${n}`,
    rateDish: (name) => `${name} కు రేటింగ్ ఇవ్వండి`,
    errOrderNotFound: "ఈ టేబుల్‌కు ఆర్డర్ కనుగొనబడలేదు.",
    errNotPaid: "ఈ ఆర్డర్‌కు ఇంకా చెల్లింపు నమోదు కాలేదు.",
    errAlreadySubmitted: "ఈ ఆర్డర్‌కు ఇప్పటికే ఫీడ్‌బ్యాక్ పంపబడింది.",
    errRateAllThree: "దయచేసి మూడు ప్రశ్నలకూ (1–10) రేటింగ్ ఇవ్వండి.",
    errDishRange: "వంటకాల రేటింగ్ 1 నుండి 10 మధ్య ఉండాలి.",
    errDishNotOnOrder: "రేట్ చేసిన వంటకం ఈ ఆర్డర్‌లో లేదు.",
  },
  hi: {
    language: "भाषा",
    title: "रेस्टोरेंट फीडबैक",
    instruction: "एक संख्या दबाएँ: 1 यानी खराब, 10 यानी बहुत बढ़िया।",
    qOverall: "आप हमारे रेस्टोरेंट को कितनी रेटिंग देंगे?",
    qFood: "खाने का स्वाद कैसा था?",
    qDevice: "ऑर्डर करने वाला डिवाइस इस्तेमाल करना कितना आसान था?",
    dishesHeading: "हर व्यंजन को रेटिंग दें (वैकल्पिक)",
    dishesEmpty: "आपके ऑर्डर किए गए व्यंजन यहाँ दिखेंगे, ताकि आप उन्हें एक-एक करके रेटिंग दे सकें।",
    submit: "फीडबैक भेजें",
    submitting: "भेजा जा रहा है…",
    thanksBox: "आपके फीडबैक के लिए धन्यवाद!",
    thanksToast: "धन्यवाद! आपका फीडबैक भेज दिया गया है।",
    placeOrderFirst: "पहले ऑर्डर करें, फिर अपने अनुभव को रेटिंग दें।",
    answerAll: "कृपया तीनों प्रश्नों के उत्तर दें (1–10)।",
    ratingOutOf: (label, n) => `${label}: 10 में से ${n}`,
    rateDish: (name) => `${name} को रेटिंग दें`,
    errOrderNotFound: "इस टेबल के लिए ऑर्डर नहीं मिला।",
    errNotPaid: "इस ऑर्डर का भुगतान अभी दर्ज नहीं हुआ है।",
    errAlreadySubmitted: "इस ऑर्डर के लिए फीडबैक पहले ही भेजा जा चुका है।",
    errRateAllThree: "कृपया तीनों प्रश्नों को रेटिंग दें (1–10)।",
    errDishRange: "व्यंजनों की रेटिंग 1 से 10 के बीच होनी चाहिए।",
    errDishNotOnOrder: "रेटिंग दिया गया व्यंजन इस ऑर्डर में नहीं है।",
  },
};
