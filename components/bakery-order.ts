export type CakeKind = "raspberry" | "cacao" | "pistachio";
export type Frosting = "vanilla" | "chocolate" | "rose";
export type Topping = "berries" | "chocolate" | "pistachio";
export type CakeOrder = { cake: CakeKind; servings: 4 | 6 | 8; frosting: Frosting; topping: Topping };

export const cakes: Record<CakeKind, { name: string; short: string; description: string; ingredients: string; price: number; color: string }> = {
  raspberry: { name: "Raspberry Rose Gateau", short: "Raspberry Rose", description: "A little romance, layer by layer.", ingredients: "Almond sponge · raspberry preserve · rose cream", price: 1240, color: "#973e52" },
  cacao: { name: "Dark Cacao No. 7", short: "Dark Cacao", description: "Deep chocolate. The lightest touch of salt.", ingredients: "70% cacao · brown butter · sea salt", price: 1160, color: "#684433" },
  pistachio: { name: "Pistachio Cloud", short: "Pistachio Cloud", description: "Soft, nutty, and quietly extraordinary.", ingredients: "Pistachio sponge · vanilla cream · roasted nuts", price: 1380, color: "#77835b" },
};

export const initialOrder: CakeOrder = { cake: "raspberry", servings: 4, frosting: "rose", topping: "berries" };
export const chapters = ["The arrival", "Come inside", "The counter", "Your creation", "The kitchen", "The golden rise", "The final flourish", "Made for you"] as const;
export const chapterDurations: Record<number, number> = { 4: 18, 5: 24, 6: 16, 7: 12 };
export const frostingLabels: Record<Frosting, string> = { vanilla: "Vanilla bean", chocolate: "Dark chocolate", rose: "Rose cream" };
export const toppingLabels: Record<Topping, string> = { berries: "Fresh berries", chocolate: "Chocolate curls", pistachio: "Pistachio" };

export function orderPrice(order: CakeOrder) {
  return Math.round(cakes[order.cake].price * order.servings / 4) + (order.frosting === "chocolate" ? 120 : 0) + (order.topping === "pistachio" ? 100 : 0);
}

export function chooseCake(order: CakeOrder, cake: CakeKind): CakeOrder {
  return { ...order, cake, frosting: cake === "cacao" ? "chocolate" : cake === "raspberry" ? "rose" : "vanilla", topping: cake === "cacao" ? "chocolate" : cake === "raspberry" ? "berries" : "pistachio" };
}

export function money(price: number) { return `₹ ${price.toLocaleString("en-IN")}`; }

export function processLabel(stage: number, progress: number) {
  if (stage === 4) return progress < .18 ? "Weighing the flour" : progress < .36 ? "Cracking fresh eggs" : progress < .58 ? "A soft snowfall of flour" : progress < .8 ? "Pouring milk & sugar" : "Bringing it all together";
  if (stage === 5) return progress < .18 ? "Mixing until silky" : progress < .32 ? "Pouring into the tin" : progress < .43 ? "Into our copper oven" : progress < .84 ? "Rising, slowly turning golden" : progress < .94 ? "Out of the oven" : "Cooling on the rack";
  if (stage === 6) return progress < .32 ? "Spreading your chosen frosting" : progress < .62 ? "Piping little clouds of cream" : progress < .9 ? "Placing your finishing touches" : "A little work of edible art";
  if (stage === 7) return progress < .3 ? "Nestling your cake into its box" : progress < .58 ? "Folding the lid" : progress < .83 ? "Tying our signature ribbon" : "One last handwritten touch";
  return chapters[stage] ?? chapters[0];
}
