export type RubricMetric = {
    category: string;
    metric: string;
    definition: string;
};

export type RubricLevel = "novice" | "intermediate" | "advanced";

const NOVICE_RUBRIC: RubricMetric[] = [
    {
        category: "Goal Alignment & Collaboration",
        metric: "Clarity of Purpose",
        definition: "The coach and client clearly define what the client wants to achieve in the session."
    },
    {
        category: "Attunement & Groundedness",
        metric: "Emotional Responsiveness",
        definition: "The coach is fully present and responds naturally to the client's emotional state."
    },
    {
        category: "Empathetic & Deep Listening",
        metric: "Reflective Understanding",
        definition: "The coach demonstrates they truly hear the client by reflecting back both content and underlying emotion."
    },
    {
        category: "Facilitating Discovery",
        metric: "Encouraging New Perspectives",
        definition: "The coach uses inquiry to help the client see their situation from a different angle."
    },
    {
        category: "Bridging Insight to Action",
        metric: "Translating Awareness",
        definition: "The coach helps the client turn their new insights into concrete, manageable steps."
    }
];

const INTERMEDIATE_PCC_RUBRIC: RubricMetric[] = [
    {
        category: "Goal Alignment & Collaboration",
        metric: "Clarity of Purpose",
        definition: "The coach partners with the client to identify or reconfirm what the client wants to accomplish in this session, including meaningful success measures."
    },
    {
        category: "Attunement & Groundedness",
        metric: "Emotional Responsiveness",
        definition: "The coach shows support and empathy, acknowledges the client's feelings and perceptions, and invites the client to respond in their own way."
    },
    {
        category: "Empathetic & Deep Listening",
        metric: "Reflective Understanding",
        definition: "The coach explores the client's words, emotions, and cues, then succinctly reflects or summarizes to support the client's clarity."
    },
    {
        category: "Facilitating Discovery",
        metric: "Encouraging New Perspectives",
        definition: "The coach asks clear, direct, primarily open-ended questions, one at a time, to help the client expand beyond current thinking or feeling."
    },
    {
        category: "Bridging Insight to Action",
        metric: "Translating Awareness",
        definition: "The coach invites the client to name learning and progress, then partners on post-session reflection, action, and accountability."
    }
];

const ADVANCED_MCC_RUBRIC: RubricMetric[] = [
    {
        category: "Goal Alignment & Collaboration",
        metric: "Clarity of Purpose",
        definition: "The coach co-creates and confirms a mutual session outcome, clarifies several aspects of the topic, and re-contracts direction when shifts emerge."
    },
    {
        category: "Attunement & Groundedness",
        metric: "Emotional Responsiveness",
        definition: "The coach consistently recognizes the client's emotions, strengths, and unique characteristics, demonstrates empathy, and acknowledges growth in the moment."
    },
    {
        category: "Empathetic & Deep Listening",
        metric: "Reflective Understanding",
        definition: "The coach recognizes nuanced language, emotion, energy, and behavior, and responds in ways that show integrated understanding across multiple client dimensions."
    },
    {
        category: "Facilitating Discovery",
        metric: "Encouraging New Perspectives",
        definition: "The coach partners to expand the client's perspective by combining succinct open inquiry with unattached observations that stimulate new awareness."
    },
    {
        category: "Bridging Insight to Action",
        metric: "Translating Awareness",
        definition: "The coach invites reflection on learning about self, partners to translate insights or learning into actions, and closes the session in partnership."
    }
];

export const customRubric: RubricMetric[] = NOVICE_RUBRIC;

export const getRubricForLevel = (level: RubricLevel): RubricMetric[] => {
    if (level === "intermediate") {
        return INTERMEDIATE_PCC_RUBRIC.map((entry) => ({ ...entry }));
    }
    if (level === "advanced") {
        return ADVANCED_MCC_RUBRIC.map((entry) => ({ ...entry }));
    }
    return NOVICE_RUBRIC.map((entry) => ({ ...entry }));
};
