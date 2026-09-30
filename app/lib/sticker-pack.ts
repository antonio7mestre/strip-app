export const STICKER_CATEGORIES = ["random", "animals", "items", "nature", "clothing", "scrap"] as const;

export type StickerCategory = (typeof STICKER_CATEGORIES)[number];

export type StickerAsset = {
  id: string;
  category: StickerCategory;
  name: string;
  src: string;
  width: number;
  height: number;
};

const names: Record<StickerCategory, Array<[string, string, number, number]>> = {
  scrap: [
    ["clear-tape", "Clear tape", 512, 173], ["frosted-tape", "Frosted tape", 512, 171],
    ["cobalt-tape", "Cobalt tape", 512, 134], ["lime-tape", "Lime tape", 512, 155],
    ["pink-tape", "Pink tape", 512, 145], ["orange-tape", "Orange tape", 512, 156],
    ["gingham-tape", "Gingham tape", 512, 134], ["checker-tape", "Checker tape", 512, 143],
    ["silver-tape", "Silver duct tape", 512, 133], ["notebook-scrap", "Notebook scrap", 411, 512],
    ["grid-scrap", "Grid paper scrap", 512, 456], ["kraft-scrap", "Kraft paper scrap", 512, 235],
    ["pink-paper", "Pink paper scrap", 512, 325], ["vellum-scrap", "Vellum scrap", 512, 341],
    ["paperclip", "Silver paperclip", 321, 512], ["binder-clip", "Red binder clip", 512, 439],
    ["photo-corner", "Photo corner", 512, 508], ["stamp-frame", "Perforated paper frame", 512, 427],
    ["red-stitch", "Red stitching", 512, 159], ["blank-ticket", "Blank yellow ticket", 512, 229],
    ["instant-frame", "Instant photo frame", 350, 512], ["cobalt-frame", "Torn cobalt frame", 512, 329],
    ["foil-frame", "Silver foil frame", 507, 512], ["oval-frame", "Pink oval frame", 466, 512],
  ],
  random: [
    ["silver-heart", "Silver heart", 373, 512], ["pearl-star", "Pearl star", 512, 507],
    ["jelly-bow", "Jelly bow", 512, 344], ["green-alien", "Green alien", 284, 512],
    ["checkered-flower", "Checkered flower", 468, 512], ["melting-smile", "Melting smile", 382, 512],
    ["blue-cloud", "Blue cloud", 512, 311], ["magic-eight-ball", "Magic eight ball", 512, 511],
    ["bubble-cluster", "Bubble cluster", 504, 512], ["mirror-ball", "Mirror ball", 460, 512],
    ["magic-wand", "Magic wand", 162, 512], ["plastic-rocket", "Plastic rocket", 317, 512],
    ["gummy-bear", "Green gummy bear", 301, 512], ["gummy-bear-pink", "Pink gummy bear", 301, 512],
    ["gummy-bear-blue", "Blue gummy bear", 301, 512], ["gummy-bear-orange", "Orange gummy bear", 301, 512],
    ["angel-wings", "Angel wings", 512, 264], ["yellow-lightning", "Yellow lightning", 198, 512],
    ["yin-yang", "Yin yang", 393, 512], ["pearl-planet", "Pearl planet", 429, 512],
  ],
  animals: [
    ["chrome-dolphin", "Silver dolphin charm", 475, 512], ["jelly-kitten", "Gray kitten", 377, 512],
    ["gem-frog", "Green tree frog", 512, 422], ["plush-bunny", "Cream plush bunny", 380, 512],
    ["pearl-swan", "White swan", 512, 499], ["orca", "Orca", 512, 328],
    ["pink-butterfly", "Pink butterfly", 512, 342],
    ["aqua-seahorse", "Golden seahorse", 255, 512], ["iridescent-snail", "Garden snail", 512, 359],
    ["cobalt-koi", "Koi fish", 512, 333], ["green-gecko", "Green gecko", 512, 507],
    ["ribbon-pony", "Chestnut pony", 468, 512], ["panda", "Giant panda", 423, 512],
    ["velvet-bat", "Brown bat", 512, 293],
    ["coral-crab", "Coral crab", 512, 329], ["blue-parrot", "Blue parrot", 376, 512],
    ["yellow-duck", "Yellow duckling", 351, 512], ["cloud-sheep", "Cream sheep", 383, 512],
    ["tiger-cub", "Tiger cub", 420, 512], ["glass-octopus", "Lilac octopus", 512, 512],
    ["hamster", "Golden hamster", 304, 512], ["honey-bee", "Honey bee", 512, 435],
  ],
  items: [
    ["flip-phone", "Silver flip phone", 254, 512], ["digital-camera", "Digital camera", 512, 289],
    ["portable-cd-player", "Portable CD player", 512, 433], ["cassette", "Clear cassette", 512, 312],
    ["roller-skate", "Roller skate", 409, 512], ["headphones", "Wired headphones", 422, 512],
    ["alarm-clock", "Round alarm clock", 380, 512], ["hair-dryer", "Hair dryer", 478, 512],
    ["game-controller", "Game controller", 512, 332], ["lip-gloss", "Pink lip gloss", 91, 512],
    ["keychain", "Silver keychain", 164, 512], ["gumball-machine", "Gumball machine", 262, 512],
    ["sunglasses", "Oval sunglasses", 512, 111], ["shoulder-bag", "Shoulder bag", 512, 512],
    ["lava-lamp", "Lava lamp", 149, 512], ["compact-mirror", "Compact mirror", 512, 465],
    ["camcorder", "Handheld camcorder", 512, 394], ["sneaker", "White sneaker", 512, 309],
    ["microphone", "Silver microphone", 240, 512], ["soda-can", "Silver soda can", 267, 512],
  ],
  nature: [
    ["pink-hibiscus", "Pink hibiscus", 503, 512], ["white-daisy", "White daisy", 512, 490],
    ["purple-orchid", "Purple orchid", 410, 512], ["red-cherries", "Red cherries", 512, 458],
    ["strawberry-vine", "Strawberry vine", 468, 512], ["pearl-shell", "Pearl shell", 512, 464],
    ["mushroom-cluster", "Mushroom cluster", 497, 512], ["palm-tree", "Palm tree", 428, 512],
    ["rain-cloud", "Rain cloud", 512, 511], ["soft-rainbow", "Soft rainbow", 512, 234],
    ["crescent-moon", "Crescent moon", 376, 512], ["warm-sun", "Warm sun", 512, 509],
    ["crystal-cluster", "Crystal cluster", 478, 512], ["pink-coral", "Pink coral", 497, 512],
    ["ocean-wave", "Ocean wave", 512, 425], ["flowering-cactus", "Flowering cactus", 436, 512],
    ["ivy-sprig", "Ivy sprig", 334, 512], ["maple-leaf", "Maple leaf", 484, 512],
    ["starfish", "Starfish", 506, 512], ["blue-hydrangea", "Blue hydrangea", 494, 512],
  ],
  clothing: [
    ["baby-tee", "Baby tee", 512, 500], ["cargo-pants", "Cargo pants", 277, 512],
    ["mini-skirt", "Mini skirt", 512, 320], ["platform-boots", "Platform boot", 489, 512],
    ["track-jacket", "Track jacket", 512, 448], ["bucket-hat", "Bucket hat", 512, 327],
    ["rugby-shirt", "Rugby shirt", 512, 462], ["carpenter-jeans", "Carpenter jeans", 257, 512],
    ["tube-top", "Tube top", 512, 403], ["low-rise-jeans", "Low-rise jeans", 288, 512],
    ["faux-fur-coat", "Faux fur coat", 512, 444], ["trucker-cap", "Trucker cap", 512, 398],
    ["chunky-belt", "Chunky belt", 512, 212], ["corset-top", "Corset top", 471, 512],
    ["bomber-jacket", "Bomber jacket", 512, 474], ["basketball-shorts", "Basketball shorts", 512, 407],
    ["hoop-earrings", "Silver hoop", 500, 512], ["platform-sandals", "Platform sandal", 512, 411],
    ["skinny-scarf", "Skinny scarf", 318, 512], ["leather-loafers", "Leather loafer", 512, 299],
  ],
};

export const STICKER_PACK: StickerAsset[] = STICKER_CATEGORIES.flatMap(category =>
  names[category].map(([id, name, width, height]) => ({
    id,
    category,
    name,
    width,
    height,
    src: `/sticker-pack/${category}/${id}.webp`,
  })),
);

export const stickersByCategory = (category: StickerCategory) =>
  STICKER_PACK.filter(sticker => sticker.category === category);

/** One normal row is a medium square (84% of a masonry column). Keep varied
 * widths, but never let a narrow object grow taller than three normal rows. */
export const STICKER_TRAY_MAX_HEIGHT = 3 * 0.84;
export function stickerTrayMaxWidth(sticker: Pick<StickerAsset, "width" | "height">) {
  return Math.min(100, STICKER_TRAY_MAX_HEIGHT * sticker.width / sticker.height * 100);
}

export const packStickerForSource = (src: string) => STICKER_PACK.find(sticker => sticker.src === src);

export function initialPackStickerWidth(width: number, sticker?: StickerAsset) {
  return sticker ? Math.min(width, width * 3 * sticker.width / sticker.height) : width;
}
