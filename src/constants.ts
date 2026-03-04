export type Difficulty = "easy" | "medium" | "hard";

export type Problem = {
    id: string;
    title: string;
    description: string;
    category: string;
    systemInstructions: Record<Difficulty, string>;
    color: string;
    icon: string;
    estimatedTime: Record<Difficulty, string>;
};

export const problems: Problem[] = [
    {
        id: "1",
        title: "Anxious Client Session",
        description:
            "Practice coaching a client experiencing anxiety and overthinking. Focus on active listening, grounding techniques, and helping them develop coping strategies.",
        category: "Anxiety",
        systemInstructions: {
            easy: "You are a client experiencing mild anxiety. Be cooperative and open to coaching. Keep your responses relatively simple.",
            medium: "You are a client experiencing moderate anxiety. You are somewhat resistant to change but willing to listen. Provide more complex emotional responses.",
            hard: "You are a client experiencing severe anxiety and panic. You are highly resistant, skeptical, and difficult to coach. Challenge the coach's suggestions.",
        },
        color: "from-[#7c5cbf] to-[#a78bfa]",
        icon: "🧠",
        estimatedTime: { easy: "10 min", medium: "15 min", hard: "20 min" },
    },
    {
        id: "2",
        title: "Career Transition Crisis",
        description:
            "Guide a client going through a major career change who feels lost and uncertain. Help them explore values, strengths, and next steps.",
        category: "Career",
        systemInstructions: {
            easy: "You are a client excited but nervous about a career change. Be very receptive to coaching.",
            medium: "You are a client feeling stuck between two career paths. You are unsure of your strengths.",
            hard: "You are a client who just lost their job and feels hopeless. You are very resistant to any suggestions of 'finding new opportunities'.",
        },
        color: "from-[#38bdf8] to-[#818cf8]",
        icon: "💼",
        estimatedTime: { easy: "10 min", medium: "20 min", hard: "25 min" },
    },
    // ... (I will add the rest of the problems here as needed)
];

export function getProblemById(id: string): Problem | undefined {
    return problems.find((p) => p.id === id);
}
