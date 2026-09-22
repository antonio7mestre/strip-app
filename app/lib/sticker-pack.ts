export const STICKER_CATEGORIES = ["random", "animals", "items", "nature", "clothing"] as const;

export type StickerCategory = (typeof STICKER_CATEGORIES)[number];

export type StickerAsset = {
  id: string;
  category: StickerCategory;
  name: string;
  src: string;
};

const names: Record<StickerCategory, Array<[string, string]>> = {
  random: [
    ["silver-heart", "Silver heart"], ["pearl-star", "Pearl star"],
    ["jelly-bow", "Jelly bow"], ["green-alien", "Green alien"],
    ["checkered-flower", "Checkered flower"], ["melting-smile", "Melting smile"],
    ["blue-cloud", "Blue cloud"], ["magic-eight-ball", "Magic eight ball"],
    ["bubble-cluster", "Bubble cluster"], ["mirror-ball", "Mirror ball"],
    ["magic-wand", "Magic wand"], ["plastic-rocket", "Plastic rocket"],
    ["gummy-bear", "Green gummy bear"], ["gummy-bear-pink", "Pink gummy bear"],
    ["gummy-bear-blue", "Blue gummy bear"], ["gummy-bear-orange", "Orange gummy bear"],
    ["angel-wings", "Angel wings"], ["yellow-lightning", "Yellow lightning"],
    ["yin-yang", "Yin yang"], ["pearl-planet", "Pearl planet"],
  ],
  animals: [
    ["chrome-dolphin", "Silver dolphin charm"], ["jelly-kitten", "Gray kitten"],
    ["gem-frog", "Green tree frog"], ["plush-bunny", "Cream plush bunny"],
    ["pearl-swan", "White swan"], ["orca", "Orca"],
    ["pink-butterfly", "Pink butterfly"],
    ["aqua-seahorse", "Golden seahorse"], ["iridescent-snail", "Garden snail"],
    ["cobalt-koi", "Koi fish"], ["green-gecko", "Green gecko"],
    ["ribbon-pony", "Chestnut pony"], ["panda", "Giant panda"],
    ["velvet-bat", "Brown bat"],
    ["coral-crab", "Coral crab"], ["blue-parrot", "Blue parrot"],
    ["yellow-duck", "Yellow duckling"], ["cloud-sheep", "Cream sheep"],
    ["tiger-cub", "Tiger cub"], ["glass-octopus", "Lilac octopus"],
    ["hamster", "Golden hamster"], ["honey-bee", "Honey bee"],
  ],
  items: [
    ["flip-phone", "Silver flip phone"], ["digital-camera", "Digital camera"],
    ["portable-cd-player", "Portable CD player"], ["cassette", "Clear cassette"],
    ["roller-skate", "Roller skate"], ["headphones", "Wired headphones"],
    ["alarm-clock", "Round alarm clock"], ["hair-dryer", "Hair dryer"],
    ["game-controller", "Game controller"], ["lip-gloss", "Pink lip gloss"],
    ["keychain", "Silver keychain"], ["gumball-machine", "Gumball machine"],
    ["sunglasses", "Oval sunglasses"], ["shoulder-bag", "Shoulder bag"],
    ["lava-lamp", "Lava lamp"], ["compact-mirror", "Compact mirror"],
    ["camcorder", "Handheld camcorder"], ["sneaker", "White sneaker"],
    ["microphone", "Silver microphone"], ["soda-can", "Silver soda can"],
  ],
  nature: [
    ["pink-hibiscus", "Pink hibiscus"], ["white-daisy", "White daisy"],
    ["purple-orchid", "Purple orchid"], ["red-cherries", "Red cherries"],
    ["strawberry-vine", "Strawberry vine"], ["pearl-shell", "Pearl shell"],
    ["mushroom-cluster", "Mushroom cluster"], ["palm-tree", "Palm tree"],
    ["rain-cloud", "Rain cloud"], ["soft-rainbow", "Soft rainbow"],
    ["crescent-moon", "Crescent moon"], ["warm-sun", "Warm sun"],
    ["crystal-cluster", "Crystal cluster"], ["pink-coral", "Pink coral"],
    ["ocean-wave", "Ocean wave"], ["flowering-cactus", "Flowering cactus"],
    ["ivy-sprig", "Ivy sprig"], ["maple-leaf", "Maple leaf"],
    ["starfish", "Starfish"], ["blue-hydrangea", "Blue hydrangea"],
  ],
  clothing: [
    ["baby-tee", "Baby tee"], ["cargo-pants", "Cargo pants"],
    ["mini-skirt", "Mini skirt"], ["platform-boots", "Platform boot"],
    ["track-jacket", "Track jacket"], ["bucket-hat", "Bucket hat"],
    ["rugby-shirt", "Rugby shirt"], ["carpenter-jeans", "Carpenter jeans"],
    ["tube-top", "Tube top"], ["low-rise-jeans", "Low-rise jeans"],
    ["faux-fur-coat", "Faux fur coat"], ["trucker-cap", "Trucker cap"],
    ["chunky-belt", "Chunky belt"], ["corset-top", "Corset top"],
    ["bomber-jacket", "Bomber jacket"], ["basketball-shorts", "Basketball shorts"],
    ["hoop-earrings", "Silver hoop"], ["platform-sandals", "Platform sandal"],
    ["skinny-scarf", "Skinny scarf"], ["leather-loafers", "Leather loafer"],
  ],
};

export const STICKER_PACK: StickerAsset[] = STICKER_CATEGORIES.flatMap(category =>
  names[category].map(([id, name]) => ({
    id,
    category,
    name,
    src: `/sticker-pack/${category}/${id}.webp`,
  })),
);

export const stickersByCategory = (category: StickerCategory) =>
  STICKER_PACK.filter(sticker => sticker.category === category);
