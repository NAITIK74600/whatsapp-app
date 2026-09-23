import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Clock3,
  ContactRound,
  Inbox,
  MessageCircle,
  Radio,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const businessName = process.env.APP_NAME || "WA Automate";

export const metadata = {
  title: `${businessName} | WhatsApp Business Automation`,
  description:
    "Manage customer conversations, AI replies, broadcasts, scheduling, and multiple WhatsApp numbers from one secure business dashboard.",
  openGraph: {
    title: `${businessName} | WhatsApp Business Automation`,
    description:
      "Turn WhatsApp conversations into an organized, always-on customer communication system.",
    type: "website",
    url:
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://azure-dinosaur-903216.hostingersite.com",
  },
};

const capabilities = [
  {
    icon: Inbox,
    eyebrow: "Unified inbox",
    title: "Every customer conversation, organized.",
    description:
      "Handle messages from connected WhatsApp numbers in one clear workspace with contacts, labels, media, and conversation history.",
    className: "md:col-span-7 md:row-span-2",
  },
  {
    icon: Sparkles,
    eyebrow: "AI assistance",
    title: "Reply faster, even after hours.",
    description:
      "Use AI auto-replies as a fallback or on every eligible message while keeping your business tone consistent.",
    className: "md:col-span-5",
  },
  {
    icon: Radio,
    eyebrow: "Campaigns",
    title: "Reach customers at scale.",
    description:
      "Send broadcasts, monitor delivery, and keep every campaign connected to the same customer workspace.",
    className: "md:col-span-5",
  },
  {
    icon: Clock3,
    eyebrow: "Scheduling",
    title: "Send the right message at the right time.",
    description:
      "Schedule one-time or recurring messages for follow-ups, reminders, updates, and routine customer care.",
    className: "md:col-span-6",
  },
  {
    icon: UsersRound,
    eyebrow: "Multi-number control",
    title: "Run multiple WhatsApp numbers together.",
    description:
      "Connect and monitor separate sessions without switching devices or losing operational visibility.",
    className: "md:col-span-6",
  },
];

const steps = [
  {
    number: "01",
    title: "Connect your number",
    description:
      "Create a session and scan the QR code to securely connect WhatsApp.",
  },
  {
    number: "02",
    title: "Set your workflows",
    description:
      "Configure AI replies, keyword responses, schedules, labels, and webhooks.",
  },
  {
    number: "03",
    title: "Serve customers",
    description:
      "Manage every conversation and campaign from one business dashboard.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f5f4ef] text-[#13251e] selection:bg-[#b9f6d4]">
      <header className="relative z-50 border-b border-[#17382b]/10 bg-[#f5f4ef]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label={`${businessName} home`}>
            <span className="flex size-10 items-center justify-center rounded-full bg-[#123c2d] text-white">
              <MessageCircle className="size-5" />
            </span>
            <span className="text-lg font-semibold tracking-[-0.03em]">{businessName}</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-[#466257] md:flex">
            <Link href="#capabilities" className="transition-colors hover:text-[#123c2d]">
              Capabilities
            </Link>
            <Link href="#how-it-works" className="transition-colors hover:text-[#123c2d]">
              How it works
            </Link>
            <Link href="#security" className="transition-colors hover:text-[#123c2d]">
              Security
            </Link>
          </nav>

          <Link href="/auth/login">
            <Button className="rounded-full bg-[#123c2d] px-6 text-white hover:bg-[#0b2d21]">
              Sign in
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="relative isolate px-5 pb-16 pt-14 sm:pt-20 lg:px-8 lg:pb-24">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_76%_18%,rgba(75,218,139,0.2),transparent_34%),radial-gradient(circle_at_15%_4%,rgba(255,255,255,0.95),transparent_30%)]" />

          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.86fr_1.14fr]">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#17382b]/15 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#345447]">
                <span className="size-2 rounded-full bg-[#20bd6b]" />
                Customer conversations, always on
              </div>

              <h1 className="text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
                Grow your business through
                <span className="block text-[#16834e]">better WhatsApp conversations.</span>
              </h1>

              <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-[#536c62]">
                Manage customer chats, automate replies with AI, schedule follow-ups,
                and run campaigns from one focused business workspace.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/login">
                  <Button
                    size="lg"
                    className="h-13 w-full rounded-full bg-[#123c2d] px-7 text-base text-white shadow-[0_14px_40px_rgba(18,60,45,0.2)] hover:bg-[#0b2d21] sm:w-auto"
                  >
                    Open business dashboard
                    <ArrowRight className="ml-2 size-5" />
                  </Button>
                </Link>
                <Link href="#capabilities">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-13 w-full rounded-full border-[#17382b]/20 bg-white/60 px-7 text-base text-[#17382b] hover:bg-white sm:w-auto"
                  >
                    See what it can do
                  </Button>
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#536c62]">
                {["Multi-number support", "AI auto-replies", "Secure admin access"].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-[#d9f6e6] text-[#16834e]">
                      <Check className="size-3.5" />
                    </span>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <BusinessDashboardPreview />
          </div>
        </section>

        <section id="capabilities" className="bg-[#123c2d] px-5 py-24 text-white lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 grid gap-6 md:grid-cols-[1fr_0.7fr] md:items-end">
              <div>
                <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#83e8b0]">
                  Built for daily operations
                </p>
                <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">
                  One workspace for the conversations that move your business.
                </h2>
              </div>
              <p className="max-w-xl text-base leading-7 text-white/65 md:justify-self-end">
                Replace scattered phones and manual follow-ups with a clear system your
                team can use every day.
              </p>
            </div>

            <div className="grid auto-rows-[minmax(210px,auto)] grid-cols-1 gap-3 md:grid-cols-12">
              {capabilities.map(({ icon: Icon, eyebrow, title, description, className }) => (
                <article
                  key={title}
                  className={`group relative overflow-hidden rounded-[1.75rem] border border-white/12 bg-white/[0.055] p-7 transition-colors hover:bg-white/[0.085] ${className}`}
                >
                  <div className="absolute right-0 top-0 size-40 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#39d98a]/10 opacity-70 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="relative flex h-full flex-col">
                    <div className="mb-12 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#83e8b0]">
                        {eyebrow}
                      </span>
                      <span className="flex size-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.06]">
                        <Icon className="size-5" />
                      </span>
                    </div>
                    <div className="mt-auto max-w-xl">
                      <h3 className="text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
                      <p className="mt-3 leading-7 text-white/60">{description}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-5 py-24 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#16834e]">
                Simple setup
              </p>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                From connection to customer care in three steps.
              </h2>
            </div>

            <div className="mt-14 grid gap-px overflow-hidden rounded-[1.75rem] border border-[#17382b]/10 bg-[#17382b]/10 md:grid-cols-3">
              {steps.map((step) => (
                <article key={step.number} className="bg-[#f8f7f2] p-8 lg:p-10">
                  <span className="font-mono text-sm text-[#16834e]">{step.number}</span>
                  <h3 className="mt-16 text-2xl font-semibold tracking-[-0.025em]">{step.title}</h3>
                  <p className="mt-3 leading-7 text-[#5f746b]">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="px-5 pb-24 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-[2rem] bg-[#dff6e8] p-8 sm:p-12 lg:grid-cols-[0.75fr_1.25fr] lg:p-16">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-[#123c2d] text-white">
              <ShieldCheck className="size-8" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#16834e]">
                Business data stays protected
              </p>
              <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
                Secure access, controlled sessions, and a private operational workspace.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-[#4d685d]">
                Your dashboard is protected by authenticated access, while connected
                sessions and customer data remain inside your own hosted environment.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-[#17382b]/10 bg-white px-5 py-20 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-[#16834e]">Ready when your customers are</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Open your business communication dashboard.
              </h2>
            </div>
            <Link href="/auth/login">
              <Button
                size="lg"
                className="h-13 rounded-full bg-[#123c2d] px-8 text-base text-white hover:bg-[#0b2d21]"
              >
                Sign in to continue
                <ArrowRight className="ml-2 size-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-[#f5f4ef] px-5 py-10 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-[#5f746b] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 font-semibold text-[#17382b]">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#123c2d] text-white">
              <Bot className="size-4" />
            </span>
            {businessName}
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-[#17382b]">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[#17382b]">
              Terms
            </Link>
            <Link href="/auth/login" className="hover:text-[#17382b]">
              Admin login
            </Link>
          </div>
          <p>© {new Date().getFullYear()} {businessName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function BusinessDashboardPreview() {
  const conversations = [
    { name: "Aarav Sharma", message: "Thanks, I received the details.", time: "10:42", active: true },
    { name: "Meera Boutique", message: "Can you confirm tomorrow's slot?", time: "10:18" },
    { name: "Rohan Foods", message: "Order #1042 is ready.", time: "09:56" },
  ];

  return (
    <div className="relative">
      <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-[#73e9a7]/20 blur-3xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-[#17382b]/10 bg-white shadow-[0_34px_90px_rgba(18,60,45,0.16)]">
        <div className="flex items-center justify-between border-b border-[#17382b]/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#123c2d] text-white">
              <MessageCircle className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Business Inbox</p>
              <p className="text-xs text-[#698076]">3 numbers connected</p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-[#e5f8ed] px-3 py-1.5 text-xs font-semibold text-[#16834e]">
            <span className="size-1.5 rounded-full bg-[#20bd6b]" />
            Live
          </span>
        </div>

        <div className="grid min-h-[460px] sm:grid-cols-[0.84fr_1.16fr]">
          <div className="border-b border-[#17382b]/10 bg-[#fbfaf6] p-3 sm:border-b-0 sm:border-r">
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#17382b]/10 bg-white px-3 py-2 text-xs text-[#7a8e85]">
              <ContactRound className="size-4" />
              Search conversations
            </div>
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.name}
                  className={`rounded-xl p-3 ${
                    conversation.active ? "bg-[#e5f8ed]" : "bg-transparent"
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{conversation.name}</p>
                    <span className="text-[10px] text-[#7a8e85]">{conversation.time}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-[#698076]">{conversation.message}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col bg-[#f3f0e7]">
            <div className="flex items-center justify-between border-b border-[#17382b]/10 bg-white px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Aarav Sharma</p>
                <p className="text-xs text-[#16834e]">Online now</p>
              </div>
              <Zap className="size-5 text-[#16834e]" />
            </div>
            <div className="flex flex-1 flex-col gap-3 p-5">
              <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-white p-3 text-sm leading-6 shadow-sm">
                Hi, can you share the service details?
              </div>
              <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-[#c9f4dc] p-3 text-sm leading-6">
                Absolutely. I have sent the details and available time slots.
                <span className="mt-1 block text-[10px] text-[#5f746b]">AI assisted · 10:41</span>
              </div>
              <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-white p-3 text-sm leading-6 shadow-sm">
                Thanks, I received the details.
              </div>
              <div className="mt-auto flex items-center gap-2 rounded-2xl border border-[#17382b]/10 bg-white p-2 pl-4 text-xs text-[#81928b]">
                Type a reply...
                <span className="ml-auto flex size-9 items-center justify-center rounded-xl bg-[#123c2d] text-white">
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-2xl border border-[#17382b]/10 bg-white p-4 shadow-xl sm:flex">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#e5f8ed] text-[#16834e]">
          <Sparkles className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold">AI reply active</p>
          <p className="text-xs text-[#698076]">Customers get instant answers</p>
        </div>
      </div>
    </div>
  );
}
