export type RubricMetric = {
    category: string;
    metric: string;
    definition: string;
};

export const customRubric: RubricMetric[] = [
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
