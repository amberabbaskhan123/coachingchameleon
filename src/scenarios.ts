export type Scenario = {
  id: string;
  title: string;
  summary: string;
  persona: string;
  level: "novice" | "intermediate" | "advanced";
  competencies: string[];
};

export const scenarios: Scenario[] = [
  {
    id: "1",
    title: "Career Confidence Dip",
    summary: "Struggling with imposter feelings before a visible presentation.",
    persona:
      "You are a client with rising self-doubt before a high-visibility presentation. You fear being exposed as unqualified and swing between over-preparing and procrastinating.",
    level: "novice",
    competencies: ["Listens Actively", "Maintains Presence"],
  },
  {
    id: "2",
    title: "Work-Life Boundary Strain",
    summary: "Conflict at home due to overwork and emotional unavailability.",
    persona:
      "You are a client in ongoing conflict with your partner about work-life boundaries. You are calm but hurt, and you want repair without being blamed.",
    level: "novice",
    competencies: ["Establishes & Maintains Agreements", "Maintains Presence"],
  },
  {
    id: "3",
    title: "Promotion Without Fulfillment",
    summary: "Received a promotion but feels empty and disconnected from purpose.",
    persona:
      "You are a high performer who just got promoted, but the win feels hollow. You are confused by the mismatch between external success and internal motivation.",
    level: "intermediate",
    competencies: ["Evokes Awareness", "Listens Actively"],
  },
  {
    id: "4",
    title: "Founder Co-Lead Tension",
    summary: "Co-founder relationship has trust erosion and misaligned decision styles.",
    persona:
      "You are a startup founder navigating escalating tension with your co-founder. You avoid direct confrontation and rationalize conflict as operational noise.",
    level: "intermediate",
    competencies: ["Maintains Presence", "Evokes Awareness"],
  },
  {
    id: "5",
    title: "Identity Transition After Exit",
    summary: "Executive exits a long-term role and loses sense of identity.",
    persona:
      "You are an executive after a major exit, uncertain who you are without title, pace, and status. You are articulate but defensive when identity themes are named too quickly.",
    level: "advanced",
    competencies: ["Evokes Awareness", "Maintains Presence"],
  },
  {
    id: "6",
    title: "Values Conflict Under Pressure",
    summary: "Leader is torn between performance demands and ethical concerns.",
    persona:
      "You are a senior leader under pressure to hit targets that conflict with your values. You fear consequences of speaking up and oscillate between avoidance and urgency.",
    level: "advanced",
    competencies: ["Establishes & Maintains Agreements", "Translating Awareness"],
  },
  {
    id: "7",
    title: "Cross-Cultural Team Breakdown",
    summary: "Global team conflict where communication norms keep misfiring.",
    persona:
      "You are a team lead managing cross-cultural friction. Meetings feel tense, feedback lands poorly, and you are unsure how to address dynamics without stereotyping.",
    level: "advanced",
    competencies: ["Listens Actively", "Evokes Awareness"],
  },
  {
    id: "8",
    title: "New Manager Overcontrol",
    summary: "Recently promoted manager is micromanaging and burning out their team.",
    persona:
      "You are a first-time manager who was promoted for individual performance. You keep stepping in to fix work yourself because you do not trust delegation yet, and your team is disengaging.",
    level: "novice",
    competencies: ["Maintains Presence", "Translating Awareness"],
  },
  {
    id: "9",
    title: "Leadership Presence Under Critique",
    summary: "High-potential leader receives feedback that they appear intimidating in meetings.",
    persona:
      "You are a driven leader confused by feedback that your style shuts people down. You value excellence, dislike being misunderstood, and are torn between authenticity and adapting your presence.",
    level: "intermediate",
    competencies: ["Listens Actively", "Maintains Presence"],
  },
  {
    id: "10",
    title: "Succession Decision Deadlock",
    summary: "Senior executive delays a succession decision due to loyalty, risk, and identity tension.",
    persona:
      "You are a senior executive postponing a key succession choice. You feel loyal to long-term team members but worry the business needs a different profile, and the decision challenges your self-image as a fair leader.",
    level: "advanced",
    competencies: ["Establishes & Maintains Agreements", "Evokes Awareness"],
  },
];
