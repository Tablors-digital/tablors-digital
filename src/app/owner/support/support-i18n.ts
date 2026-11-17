import {
  FEEDBACK_LANGUAGES,
  FEEDBACK_LANGUAGE_NAMES,
  isFeedbackLanguage,
  type FeedbackLanguage,
} from "@/server/modules/feedback/i18n";

/**
 * Support page wording in English / Telugu / Hindi.
 *
 * The language codes, display names and type guard are the project's existing ones
 * (feedback/i18n.ts, the same en/te/hi set as Settings → Language). Only the
 * wording itself lives here, because the existing dictionary holds customer-feedback
 * text and nothing for the owner portal. Plain module: shared by client and server.
 */
export type SupportLanguage = FeedbackLanguage;
export const SUPPORT_LANGUAGES = FEEDBACK_LANGUAGES;
export const SUPPORT_LANGUAGE_NAMES = FEEDBACK_LANGUAGE_NAMES;
export const isSupportLanguage = isFeedbackLanguage;

export const SUPPORT_LOCALES: Record<SupportLanguage, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };

/** Codes the server actions return; the page turns them into translated messages. */
export type SupportErrorCode =
  | "unauthorized"
  | "subject_short"
  | "subject_long"
  | "category"
  | "priority"
  | "description_short"
  | "description_long"
  | "file_count"
  | "file_size"
  | "file_type"
  | "reply_empty"
  | "not_found"
  | "closed"
  | "transition"
  | "generic";

const en = {
  heading: "Support",
  subtitle: "Raise a ticket for devices, software or installation.",
  raise: "Raise Support Ticket",
  refresh: "Refresh",
  refreshing: "Refreshing…",
  language: "Language",

  openTickets: "Open Tickets",
  resolvedTickets: "Resolved Tickets",
  totalTickets: "Total Tickets",
  openHint: "Including in progress",
  resolvedHint: "Resolved or closed",
  totalHint: "All time",

  searchPlaceholder: "Search by ticket ID, subject or message",
  allStatus: "All Status",
  allCategories: "All Categories",
  allPriority: "All Priority",
  clearFilters: "Clear filters",
  showingCount: (n: number, total: number) => `${n} of ${total} tickets`,

  colId: "Ticket ID",
  colSubject: "Subject",
  colCategory: "Category",
  colPriority: "Priority",
  colStatus: "Status",
  colCreated: "Created On",
  colUpdated: "Last Update",
  colActions: "Actions",

  cat: { hardware: "Hardware", software: "Software", installation: "Installation", payment: "Payment", other: "Other" },
  pri: { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" },
  st: { open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed" },

  view: "View",
  resolve: "Mark resolved",
  reopen: "Reopen",
  closeTicket: "Close ticket",

  raiseTitle: "Raise a support ticket",
  raiseSub: "Tell us what is wrong and we will help.",
  fSubject: "Subject",
  fCategory: "Category",
  fPriority: "Priority",
  fDescription: "Description",
  fAttachment: "Attachment (optional)",
  subjectPh: "e.g. Table 5 device will not turn on",
  descPh: "Describe the problem in detail",
  selectCategory: "Select category",
  selectPriority: "Select priority",
  attachHint: "Up to 3 files, 300 KB each. PNG, JPG, WebP or PDF.",
  chooseFiles: "Choose files",
  removeFile: "Remove",
  submit: "Submit Ticket",
  submitting: "Submitting…",
  cancel: "Cancel",

  errSubjectShort: "Subject must be at least 3 characters",
  errSubjectLong: "Subject can be at most 120 characters",
  errCategory: "Please select a category",
  errPriority: "Please select a priority",
  errDescShort: "Please describe the problem (at least 10 characters)",
  errDescLong: "Description can be at most 2000 characters",
  errFileCount: "You can attach at most 3 files",
  errFileSize: (name: string) => `“${name}” is larger than 300 KB`,
  errFileType: (name: string) => `“${name}” is not a PNG, JPG, WebP or PDF file`,
  errReplyEmpty: "Please write a message",
  errUnauthorized: "You do not have access to support",
  errNotFound: "Ticket not found",
  errClosed: "This ticket is closed",
  errTransition: "That change is not possible for this ticket",
  errGeneric: "Something went wrong. Please try again.",

  toastCreated: (id: string) => `Ticket ${id} submitted`,
  toastReplied: "Message sent",
  toastResolved: "Ticket marked as resolved",
  toastReopened: "Ticket reopened",
  toastClosed: "Ticket closed",
  toastRefreshed: "Tickets refreshed",

  ticketInfo: "Ticket information",
  description: "Description",
  attachments: "Attachments",
  noAttachments: "No attachments",
  conversation: "Conversation",
  you: "You",
  supportTeam: "Tablor Support",
  noReplies: "No reply from support yet.",
  replyPh: "Write a message…",
  send: "Send",
  sending: "Sending…",
  closedNote: "This ticket is closed. Raise a new ticket if you need more help.",
  closeDialog: "Close",
  openFile: "Open",

  confirmCloseTitle: "Close this ticket?",
  confirmCloseBody:
    "A closed ticket cannot be reopened or replied to. Raise a new ticket if the problem comes back.",
  confirmClose: "Yes, close ticket",
  keepOpen: "Keep open",

  emptyTitle: "No tickets yet",
  emptyBody: "You haven't raised any support tickets.",
  noMatch: "No tickets match these filters.",
};

export type SupportStrings = typeof en;

const te: SupportStrings = {
  heading: "సపోర్ట్",
  subtitle: "డివైస్‌లు, సాఫ్ట్‌వేర్ లేదా ఇన్‌స్టాలేషన్ కోసం టికెట్ పెట్టండి.",
  raise: "సపోర్ట్ టికెట్ పెట్టండి",
  refresh: "రిఫ్రెష్",
  refreshing: "రిఫ్రెష్ అవుతోంది…",
  language: "భాష",

  openTickets: "ఓపెన్ టికెట్లు",
  resolvedTickets: "పరిష్కరించిన టికెట్లు",
  totalTickets: "మొత్తం టికెట్లు",
  openHint: "ప్రోగ్రెస్‌లో ఉన్నవి సహా",
  resolvedHint: "పరిష్కరించినవి లేదా మూసివేసినవి",
  totalHint: "అన్ని కాలాల్లో",

  searchPlaceholder: "టికెట్ ID, సబ్జెక్ట్ లేదా సందేశం ద్వారా వెతకండి",
  allStatus: "అన్ని స్థితులు",
  allCategories: "అన్ని వర్గాలు",
  allPriority: "అన్ని ప్రాధాన్యతలు",
  clearFilters: "ఫిల్టర్లు తొలగించండి",
  showingCount: (n, total) => `${total} లో ${n} టికెట్లు`,

  colId: "టికెట్ ID",
  colSubject: "సబ్జెక్ట్",
  colCategory: "వర్గం",
  colPriority: "ప్రాధాన్యత",
  colStatus: "స్థితి",
  colCreated: "సృష్టించిన తేదీ",
  colUpdated: "చివరి అప్‌డేట్",
  colActions: "చర్యలు",

  cat: { hardware: "హార్డ్‌వేర్", software: "సాఫ్ట్‌వేర్", installation: "ఇన్‌స్టాలేషన్", payment: "చెల్లింపు", other: "ఇతరాలు" },
  pri: { low: "తక్కువ", medium: "మధ్యస్థం", high: "ఎక్కువ", urgent: "అత్యవసరం" },
  st: { open: "ఓపెన్", in_progress: "ప్రోగ్రెస్‌లో ఉంది", resolved: "పరిష్కరించబడింది", closed: "మూసివేయబడింది" },

  view: "చూడండి",
  resolve: "పరిష్కరించినట్లు గుర్తించండి",
  reopen: "మళ్లీ తెరవండి",
  closeTicket: "టికెట్ మూసివేయండి",

  raiseTitle: "సపోర్ట్ టికెట్ పెట్టండి",
  raiseSub: "సమస్య ఏమిటో చెప్పండి, మేము సహాయం చేస్తాము.",
  fSubject: "సబ్జెక్ట్",
  fCategory: "వర్గం",
  fPriority: "ప్రాధాన్యత",
  fDescription: "వివరణ",
  fAttachment: "అటాచ్‌మెంట్ (ఐచ్ఛికం)",
  subjectPh: "ఉదా. టేబుల్ 5 డివైస్ ఆన్ కావడం లేదు",
  descPh: "సమస్యను వివరంగా రాయండి",
  selectCategory: "వర్గాన్ని ఎంచుకోండి",
  selectPriority: "ప్రాధాన్యతను ఎంచుకోండి",
  attachHint: "గరిష్టంగా 3 ఫైళ్లు, ఒక్కొక్కటి 300 KB వరకు. PNG, JPG, WebP లేదా PDF.",
  chooseFiles: "ఫైళ్లను ఎంచుకోండి",
  removeFile: "తొలగించండి",
  submit: "టికెట్ సమర్పించండి",
  submitting: "సమర్పిస్తోంది…",
  cancel: "రద్దు చేయండి",

  errSubjectShort: "సబ్జెక్ట్ కనీసం 3 అక్షరాలు ఉండాలి",
  errSubjectLong: "సబ్జెక్ట్ 120 అక్షరాలకు మించకూడదు",
  errCategory: "దయచేసి వర్గాన్ని ఎంచుకోండి",
  errPriority: "దయచేసి ప్రాధాన్యతను ఎంచుకోండి",
  errDescShort: "సమస్యను వివరించండి (కనీసం 10 అక్షరాలు)",
  errDescLong: "వివరణ 2000 అక్షరాలకు మించకూడదు",
  errFileCount: "గరిష్టంగా 3 ఫైళ్లను మాత్రమే జత చేయవచ్చు",
  errFileSize: (name) => `“${name}” 300 KB కంటే పెద్దది`,
  errFileType: (name) => `“${name}” PNG, JPG, WebP లేదా PDF ఫైల్ కాదు`,
  errReplyEmpty: "దయచేసి సందేశం రాయండి",
  errUnauthorized: "సపోర్ట్‌ను ఉపయోగించడానికి మీకు అనుమతి లేదు",
  errNotFound: "టికెట్ కనుగొనబడలేదు",
  errClosed: "ఈ టికెట్ మూసివేయబడింది",
  errTransition: "ఈ టికెట్‌కు ఆ మార్పు సాధ్యం కాదు",
  errGeneric: "ఏదో తప్పు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.",

  toastCreated: (id) => `టికెట్ ${id} సమర్పించబడింది`,
  toastReplied: "సందేశం పంపబడింది",
  toastResolved: "టికెట్ పరిష్కరించినట్లు గుర్తించబడింది",
  toastReopened: "టికెట్ మళ్లీ తెరవబడింది",
  toastClosed: "టికెట్ మూసివేయబడింది",
  toastRefreshed: "టికెట్లు రిఫ్రెష్ అయ్యాయి",

  ticketInfo: "టికెట్ వివరాలు",
  description: "వివరణ",
  attachments: "అటాచ్‌మెంట్లు",
  noAttachments: "అటాచ్‌మెంట్లు లేవు",
  conversation: "సంభాషణ",
  you: "మీరు",
  supportTeam: "టాబ్లార్ సపోర్ట్",
  noReplies: "సపోర్ట్ నుండి ఇంకా సమాధానం రాలేదు.",
  replyPh: "సందేశం రాయండి…",
  send: "పంపండి",
  sending: "పంపుతోంది…",
  closedNote: "ఈ టికెట్ మూసివేయబడింది. మళ్లీ సహాయం కావాలంటే కొత్త టికెట్ పెట్టండి.",
  closeDialog: "మూసివేయండి",
  openFile: "తెరవండి",

  confirmCloseTitle: "ఈ టికెట్‌ను మూసివేయాలా?",
  confirmCloseBody:
    "మూసివేసిన టికెట్‌ను మళ్లీ తెరవలేరు, దానికి సందేశాలు కూడా పంపలేరు. సమస్య మళ్లీ వస్తే కొత్త టికెట్ పెట్టండి.",
  confirmClose: "అవును, మూసివేయండి",
  keepOpen: "తెరిచే ఉంచండి",

  emptyTitle: "ఇంకా టికెట్లు లేవు",
  emptyBody: "మీరు ఇంకా ఎలాంటి సపోర్ట్ టికెట్లు పెట్టలేదు.",
  noMatch: "ఈ ఫిల్టర్లకు సరిపోయే టికెట్లు లేవు.",
};

const hi: SupportStrings = {
  heading: "सहायता",
  subtitle: "डिवाइस, सॉफ़्टवेयर या इंस्टॉलेशन के लिए टिकट बनाएँ।",
  raise: "सहायता टिकट बनाएँ",
  refresh: "रीफ़्रेश",
  refreshing: "रीफ़्रेश हो रहा है…",
  language: "भाषा",

  openTickets: "खुले टिकट",
  resolvedTickets: "हल किए गए टिकट",
  totalTickets: "कुल टिकट",
  openHint: "प्रगति में चल रहे सहित",
  resolvedHint: "हल किए गए या बंद",
  totalHint: "अब तक के सभी",

  searchPlaceholder: "टिकट आईडी, विषय या संदेश से खोजें",
  allStatus: "सभी स्थितियाँ",
  allCategories: "सभी श्रेणियाँ",
  allPriority: "सभी प्राथमिकताएँ",
  clearFilters: "फ़िल्टर हटाएँ",
  showingCount: (n, total) => `${total} में से ${n} टिकट`,

  colId: "टिकट आईडी",
  colSubject: "विषय",
  colCategory: "श्रेणी",
  colPriority: "प्राथमिकता",
  colStatus: "स्थिति",
  colCreated: "बनाने की तारीख़",
  colUpdated: "अंतिम अपडेट",
  colActions: "कार्रवाई",

  cat: { hardware: "हार्डवेयर", software: "सॉफ़्टवेयर", installation: "इंस्टॉलेशन", payment: "भुगतान", other: "अन्य" },
  pri: { low: "कम", medium: "मध्यम", high: "उच्च", urgent: "अत्यावश्यक" },
  st: { open: "खुला", in_progress: "प्रगति में", resolved: "हल हो गया", closed: "बंद" },

  view: "देखें",
  resolve: "हल किया गया चिह्नित करें",
  reopen: "फिर से खोलें",
  closeTicket: "टिकट बंद करें",

  raiseTitle: "सहायता टिकट बनाएँ",
  raiseSub: "समस्या बताइए, हम मदद करेंगे।",
  fSubject: "विषय",
  fCategory: "श्रेणी",
  fPriority: "प्राथमिकता",
  fDescription: "विवरण",
  fAttachment: "अटैचमेंट (वैकल्पिक)",
  subjectPh: "जैसे: टेबल 5 का डिवाइस चालू नहीं हो रहा",
  descPh: "समस्या को विस्तार से लिखें",
  selectCategory: "श्रेणी चुनें",
  selectPriority: "प्राथमिकता चुनें",
  attachHint: "अधिकतम 3 फ़ाइलें, प्रत्येक 300 KB तक। PNG, JPG, WebP या PDF।",
  chooseFiles: "फ़ाइलें चुनें",
  removeFile: "हटाएँ",
  submit: "टिकट जमा करें",
  submitting: "जमा हो रहा है…",
  cancel: "रद्द करें",

  errSubjectShort: "विषय कम से कम 3 अक्षर का होना चाहिए",
  errSubjectLong: "विषय 120 अक्षरों से अधिक नहीं हो सकता",
  errCategory: "कृपया श्रेणी चुनें",
  errPriority: "कृपया प्राथमिकता चुनें",
  errDescShort: "कृपया समस्या का वर्णन करें (कम से कम 10 अक्षर)",
  errDescLong: "विवरण 2000 अक्षरों से अधिक नहीं हो सकता",
  errFileCount: "अधिकतम 3 फ़ाइलें ही जोड़ी जा सकती हैं",
  errFileSize: (name) => `“${name}” 300 KB से बड़ी है`,
  errFileType: (name) => `“${name}” PNG, JPG, WebP या PDF फ़ाइल नहीं है`,
  errReplyEmpty: "कृपया संदेश लिखें",
  errUnauthorized: "आपको सहायता का उपयोग करने की अनुमति नहीं है",
  errNotFound: "टिकट नहीं मिला",
  errClosed: "यह टिकट बंद है",
  errTransition: "इस टिकट के लिए यह बदलाव संभव नहीं है",
  errGeneric: "कुछ गड़बड़ हो गई। कृपया फिर से कोशिश करें।",

  toastCreated: (id) => `टिकट ${id} जमा हो गया`,
  toastReplied: "संदेश भेज दिया गया",
  toastResolved: "टिकट हल किया गया चिह्नित हुआ",
  toastReopened: "टिकट फिर से खोला गया",
  toastClosed: "टिकट बंद कर दिया गया",
  toastRefreshed: "टिकट रीफ़्रेश हो गए",

  ticketInfo: "टिकट की जानकारी",
  description: "विवरण",
  attachments: "अटैचमेंट",
  noAttachments: "कोई अटैचमेंट नहीं",
  conversation: "बातचीत",
  you: "आप",
  supportTeam: "टैब्लर सहायता",
  noReplies: "सहायता टीम का जवाब अभी नहीं आया है।",
  replyPh: "संदेश लिखें…",
  send: "भेजें",
  sending: "भेजा जा रहा है…",
  closedNote: "यह टिकट बंद है। और मदद चाहिए तो नया टिकट बनाएँ।",
  closeDialog: "बंद करें",
  openFile: "खोलें",

  confirmCloseTitle: "यह टिकट बंद करें?",
  confirmCloseBody:
    "बंद टिकट को फिर से खोला नहीं जा सकता और उस पर संदेश नहीं भेजे जा सकते। समस्या दोबारा आए तो नया टिकट बनाएँ।",
  confirmClose: "हाँ, बंद करें",
  keepOpen: "खुला रहने दें",

  emptyTitle: "अभी कोई टिकट नहीं",
  emptyBody: "आपने अभी तक कोई सहायता टिकट नहीं बनाया है।",
  noMatch: "इन फ़िल्टर से कोई टिकट मेल नहीं खाता।",
};

export const SUPPORT_STRINGS: Record<SupportLanguage, SupportStrings> = { en, te, hi };

/** Server error code -> translated message. */
export function errorText(t: SupportStrings, code: SupportErrorCode, detail?: string): string {
  switch (code) {
    case "unauthorized": return t.errUnauthorized;
    case "subject_short": return t.errSubjectShort;
    case "subject_long": return t.errSubjectLong;
    case "category": return t.errCategory;
    case "priority": return t.errPriority;
    case "description_short": return t.errDescShort;
    case "description_long": return t.errDescLong;
    case "file_count": return t.errFileCount;
    case "file_size": return t.errFileSize(detail ?? "");
    case "file_type": return t.errFileType(detail ?? "");
    case "reply_empty": return t.errReplyEmpty;
    case "not_found": return t.errNotFound;
    case "closed": return t.errClosed;
    case "transition": return t.errTransition;
    default: return t.errGeneric;
  }
}
