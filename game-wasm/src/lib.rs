// Midsommer Madness WebAssembly Game Physics, Entities, and Particle Engine
// Written in Rust, compiled to wasm32-unknown-unknown

// --- PARTICLE STRUCT ---
#[derive(Copy, Clone)]
struct Particle {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    life: f32,
    max_life: f32,
    size: f32,
    color_idx: i32,
}

const MAX_PARTICLES: usize = 1000;
static mut PARTICLES: [Particle; MAX_PARTICLES] = [Particle {
    x: 0.0,
    y: 0.0,
    vx: 0.0,
    vy: 0.0,
    life: 0.0,
    max_life: 0.0,
    size: 0.0,
    color_idx: 0,
}; MAX_PARTICLES];

static mut ACTIVE_COUNT: usize = 0;

// --- MATH HELPERS ---

#[no_mangle]
pub extern "C" fn distance(x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    let dx = x1 - x2;
    let dy = y1 - y2;
    (dx * dx + dy * dy).sqrt()
}

#[no_mangle]
pub extern "C" fn check_aabb_collision(
    x1: f32, y1: f32, w1: f32, h1: f32,
    x2: f32, y2: f32, w2: f32, h2: f32,
) -> bool {
    (x1 - w1 / 2.0 < x2 + w2 / 2.0) &&
    (x1 + w1 / 2.0 > x2 - w2 / 2.0) &&
    (y1 - h1 / 2.0 < y2 + h2 / 2.0) &&
    (y1 + h1 / 2.0 > y2 - h2 / 2.0)
}

#[no_mangle]
pub extern "C" fn check_circle_collision(
    x1: f32, y1: f32, r1: f32,
    x2: f32, y2: f32, r2: f32,
) -> bool {
    let dx = x1 - x2;
    let dy = y1 - y2;
    let dist_sq = dx * dx + dy * dy;
    let r_sum = r1 + r2;
    dist_sq < r_sum * r_sum
}

#[no_mangle]
pub extern "C" fn normalize_vector_x(dx: f32, dy: f32) -> f32 {
    let len = (dx * dx + dy * dy).sqrt();
    if len == 0.0 { 0.0 } else { dx / len }
}

#[no_mangle]
pub extern "C" fn normalize_vector_y(dx: f32, dy: f32) -> f32 {
    let len = (dx * dx + dy * dy).sqrt();
    if len == 0.0 { 0.0 } else { dy / len }
}

// --- PARTICLE SYSTEM ---

#[no_mangle]
pub extern "C" fn spawn_particle(
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    max_life: f32,
    size: f32,
    color_idx: i32,
) -> i32 {
    unsafe {
        if ACTIVE_COUNT < MAX_PARTICLES {
            PARTICLES[ACTIVE_COUNT] = Particle {
                x,
                y,
                vx,
                vy,
                life: max_life,
                max_life,
                size,
                color_idx,
            };
            ACTIVE_COUNT += 1;
            (ACTIVE_COUNT - 1) as i32
        } else {
            -1
        }
    }
}

#[no_mangle]
pub extern "C" fn update_particles() {
    unsafe {
        let mut write_idx = 0;
        for read_idx in 0..ACTIVE_COUNT {
            let mut p = Particle {
                x: PARTICLES[read_idx].x,
                y: PARTICLES[read_idx].y,
                vx: PARTICLES[read_idx].vx,
                vy: PARTICLES[read_idx].vy,
                life: PARTICLES[read_idx].life,
                max_life: PARTICLES[read_idx].max_life,
                size: PARTICLES[read_idx].size,
                color_idx: PARTICLES[read_idx].color_idx,
            };
            
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.life -= 1.0;

            if p.life > 0.0 {
                PARTICLES[write_idx] = p;
                write_idx += 1;
            }
        }
        ACTIVE_COUNT = write_idx;
    }
}

#[no_mangle]
pub extern "C" fn get_active_particles_count() -> i32 {
    unsafe { ACTIVE_COUNT as i32 }
}

#[no_mangle]
pub extern "C" fn get_particle_x(idx: i32) -> f32 {
    unsafe { PARTICLES[idx as usize].x }
}

#[no_mangle]
pub extern "C" fn get_particle_y(idx: i32) -> f32 {
    unsafe { PARTICLES[idx as usize].y }
}

#[no_mangle]
pub extern "C" fn get_particle_size(idx: i32) -> f32 {
    unsafe { PARTICLES[idx as usize].size }
}

#[no_mangle]
pub extern "C" fn get_particle_life(idx: i32) -> f32 {
    unsafe { PARTICLES[idx as usize].life }
}

#[no_mangle]
pub extern "C" fn get_particle_max_life(idx: i32) -> f32 {
    unsafe { PARTICLES[idx as usize].max_life }
}

#[no_mangle]
pub extern "C" fn get_particle_color_idx(idx: i32) -> i32 {
    unsafe { PARTICLES[idx as usize].color_idx }
}

#[no_mangle]
pub extern "C" fn clear_particles() {
    unsafe {
        ACTIVE_COUNT = 0;
    }
}

// --- WASM-FIRST GAMEPLAY STATE STRUCTURES ---

struct Player {
    x: f32,
    y: f32,
    health: f32,
    max_health: f32,
    ammo_surstromming: i32,
    ammo_flatpack: i32,
    angle: f32,
    score: i32,
    damage_cooldown: f32,
    speed_boost_active: bool,
    shield_active: bool,
    speed_boost_timer: f32,
}

#[derive(Copy, Clone)]
struct Enemy {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    size: f32,
    enemy_type: i32, // 0=Shopper, 1=Drunkard, 2=CandyKid, 3=ZappaFan, 4=VolvoCar, 5=DalarnaHorse, 6=Elk, 7=Guard, 8=Raver, 9=ABBAbot
    health: f32,
    max_health: f32,
    angle: f32,
    active: bool,
    speed: f32,
    state_timer: f32,
    state: i32,
}

#[derive(Copy, Clone)]
struct Projectile {
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    size: f32,
    proj_type: i32, // 0=Can, 1=Box, 2=GasCloud, 3=Bottle, 4=MusicNote, 5=LaserBall, 6=Glowstick, 7=Handcuffs, 8=Candy
    active: bool,
    life: f32,
    owner: i32, // 0=Player, 1=Enemy
}

#[derive(Copy, Clone)]
struct Item {
    x: f32,
    y: f32,
    item_type: i32, // 0=Meatball, 1=Knackebrod
    active: bool,
}

struct GameState {
    level_index: i32,
    level_timer: f32,
    enemies_defeated: i32,
    portal_active: bool,
    level_completed: bool,
    game_over: bool,
    meatballs_collected: i32,
    horses_defeated: i32,
}

// --- GLOBAL STATIC STATE ---

const MAX_ENEMIES: usize = 100;
static mut ENEMIES: [Enemy; MAX_ENEMIES] = [Enemy {
    x: 0.0, y: 0.0, vx: 0.0, vy: 0.0, size: 0.0,
    enemy_type: 0, health: 0.0, max_health: 0.0,
    angle: 0.0, active: false, speed: 0.0,
    state_timer: 0.0, state: 0,
}; MAX_ENEMIES];

const MAX_PROJECTILES: usize = 200;
static mut PROJECTILES: [Projectile; MAX_PROJECTILES] = [Projectile {
    x: 0.0, y: 0.0, vx: 0.0, vy: 0.0, size: 0.0,
    proj_type: 0, active: false, life: 0.0, owner: 0,
}; MAX_PROJECTILES];

const MAX_ITEMS: usize = 50;
static mut ITEMS: [Item; MAX_ITEMS] = [Item {
    x: 0.0, y: 0.0, item_type: 0, active: false,
}; MAX_ITEMS];

static mut PLAYER: Player = Player {
    x: 640.0,
    y: 360.0,
    health: 100.0,
    max_health: 100.0,
    ammo_surstromming: 10,
    ammo_flatpack: 5,
    angle: 0.0,
    score: 0,
    damage_cooldown: 0.0,
    speed_boost_active: false,
    shield_active: false,
    speed_boost_timer: 0.0,
};

static mut GAME_STATE: GameState = GameState {
    level_index: 0,
    level_timer: 65.0,
    enemies_defeated: 0,
    portal_active: false,
    level_completed: false,
    game_over: false,
    meatballs_collected: 0,
    horses_defeated: 0,
};

// --- PSEUDO RANDOM NUMBER GENERATOR (LCG) ---

static mut RNG_STATE: u32 = 12345;

fn random_f32() -> f32 {
    unsafe {
        RNG_STATE = RNG_STATE.wrapping_mul(1103515245).wrapping_add(12345);
        let val = (RNG_STATE / 65536) % 32768;
        (val as f32) / 32768.0
    }
}

fn random_range(min: f32, max: f32) -> f32 {
    min + random_f32() * (max - min)
}

// --- PENDING SFX TRIGGER ENGINE ---

const MAX_SOUNDS: usize = 16;
static mut SOUND_EVENTS: [i32; MAX_SOUNDS] = [0; MAX_SOUNDS];
static mut SOUND_EVENT_COUNT: usize = 0;

#[no_mangle]
pub extern "C" fn trigger_sound_wasm(sound_id: i32) {
    unsafe {
        if SOUND_EVENT_COUNT < MAX_SOUNDS {
            SOUND_EVENTS[SOUND_EVENT_COUNT] = sound_id;
            SOUND_EVENT_COUNT += 1;
        }
    }
}

#[no_mangle]
pub extern "C" fn get_sound_event_count() -> i32 {
    unsafe { SOUND_EVENT_COUNT as i32 }
}

#[no_mangle]
pub extern "C" fn get_sound_event(idx: i32) -> i32 {
    unsafe {
        if idx >= 0 && (idx as usize) < SOUND_EVENT_COUNT {
            SOUND_EVENTS[idx as usize]
        } else {
            0
        }
    }
}

#[no_mangle]
pub extern "C" fn clear_sound_events() {
    unsafe {
        SOUND_EVENT_COUNT = 0;
    }
}

fn get_projectile_damage(proj_type: i32) -> f32 {
    match proj_type {
        3 => 12.0, // Bottle
        4 => 8.0,  // MusicNote
        5 => 15.0, // LaserBall
        6 => 10.0, // Glowstick
        7 => 8.0,  // Handcuffs
        8 => 8.0,  // Candy
        _ => 15.0,
    }
}

fn get_enemy_stats(enemy_type: i32) -> (f32, f32, f32) {
    match enemy_type {
        0 => (45.0, 18.0, 1.3),  // Shopper
        1 => (60.0, 18.0, 1.1),  // Drunkard
        2 => (40.0, 15.0, 1.7),  // CandyKid
        3 => (50.0, 18.0, 1.2),  // ZappaFan
        4 => (200.0, 22.0, 6.0), // VolvoCar
        5 => (100.0, 24.0, 1.4), // DalarnaHorse
        6 => (120.0, 25.0, 1.6), // Elk
        7 => (80.0, 20.0, 1.4),  // Guard
        8 => (65.0, 18.0, 1.5),  // Raver
        9 => (150.0, 22.0, 1.2), // ABBAbot
        _ => (45.0, 18.0, 1.3),
    }
}

// --- COMPREHENSIVE PLAYPASS GAME STATE ENGINE ---

#[no_mangle]
pub extern "C" fn init_level_wasm(level_idx: i32) {
    unsafe {
        GAME_STATE.level_index = level_idx;
        GAME_STATE.level_timer = 65.0;
        GAME_STATE.enemies_defeated = 0;
        // Level 5 (index 4) Volvo highway is a survival crossing level; portal/exit is open immediately
        GAME_STATE.portal_active = if level_idx == 4 { true } else { false };
        GAME_STATE.level_completed = false;
        GAME_STATE.game_over = false;

        PLAYER.x = 640.0;
        PLAYER.y = 360.0;
        PLAYER.damage_cooldown = 0.0;
        PLAYER.speed_boost_active = false;
        PLAYER.shield_active = false;
        PLAYER.speed_boost_timer = 0.0;
        
        if level_idx == 0 {
            PLAYER.health = 100.0;
            PLAYER.max_health = 100.0;
            PLAYER.ammo_surstromming = 10;
            PLAYER.ammo_flatpack = 5;
            PLAYER.score = 0;
            GAME_STATE.meatballs_collected = 0;
            GAME_STATE.horses_defeated = 0;
        }

        for i in 0..MAX_ENEMIES {
            ENEMIES[i].active = false;
        }
        for i in 0..MAX_PROJECTILES {
            PROJECTILES[i].active = false;
        }
        for i in 0..MAX_ITEMS {
            ITEMS[i].active = false;
        }
        
        SOUND_EVENT_COUNT = 0;

        // Native Initial Spawning
        if level_idx != 4 {
            let (hp, size, speed) = get_enemy_stats(level_idx);
            for _ in 0..3 {
                let ex = random_range(600.0, 1200.0);
                let ey = random_range(100.0, 600.0);
                spawn_enemy_wasm(ex, ey, level_idx, hp, size, speed);
            }
            // Spawn initial food items (1 Meatball, 1 Knackebrod)
            spawn_item_wasm(random_range(150.0, 1100.0), random_range(100.0, 620.0), 0);
            spawn_item_wasm(random_range(150.0, 1100.0), random_range(100.0, 620.0), 1);
        }
    }
}

#[no_mangle]
pub extern "C" fn spawn_enemy_wasm(
    x: f32,
    y: f32,
    enemy_type: i32,
    health: f32,
    size: f32,
    speed: f32,
) -> i32 {
    unsafe {
        for i in 0..MAX_ENEMIES {
            if !ENEMIES[i].active {
                ENEMIES[i] = Enemy {
                    x,
                    y,
                    vx: 0.0,
                    vy: 0.0,
                    size,
                    enemy_type,
                    health,
                    max_health: health,
                    angle: 0.0,
                    active: true,
                    speed,
                    state_timer: random_range(1.0, 3.0),
                    state: 0,
                };
                
                if enemy_type == 4 { // VolvoCar
                    ENEMIES[i].vx = if x < 640.0 { speed } else { -speed };
                }
                
                return i as i32;
            }
        }
        -1
    }
}

#[no_mangle]
pub extern "C" fn spawn_projectile_wasm(
    x: f32,
    y: f32,
    vx: f32,
    vy: f32,
    size: f32,
    proj_type: i32,
    owner: i32,
    life: f32,
) -> i32 {
    unsafe {
        for i in 0..MAX_PROJECTILES {
            if !PROJECTILES[i].active {
                PROJECTILES[i] = Projectile {
                    x,
                    y,
                    vx,
                    vy,
                    size,
                    proj_type,
                    active: true,
                    life,
                    owner,
                };
                return i as i32;
            }
        }
        -1
    }
}

#[no_mangle]
pub extern "C" fn spawn_item_wasm(x: f32, y: f32, item_type: i32) -> i32 {
    unsafe {
        for i in 0..MAX_ITEMS {
            if !ITEMS[i].active {
                ITEMS[i] = Item {
                    x,
                    y,
                    item_type,
                    active: true,
                };
                return i as i32;
            }
        }
        -1
    }
}

#[no_mangle]
pub extern "C" fn update_game_wasm(
    keys_bitmask: i32, // bit 0=W, bit 1=S, bit 2=A, bit 3=D
    joystick_x: f32,
    joystick_y: f32,
    mouse_x: f32,
    mouse_y: f32,
    attack_melee: bool,
    attack_ranged: bool,
    dt: f32,
) {
    unsafe {
        if GAME_STATE.game_over || GAME_STATE.level_completed {
            return;
        }

        // 1. UPDATE TIMER
        GAME_STATE.level_timer -= dt;
        if GAME_STATE.level_timer <= 0.0 {
            GAME_STATE.game_over = true;
            trigger_sound_wasm(7); // 'lose'
            return;
        }

        // 2. UPDATE PLAYER
        if PLAYER.damage_cooldown > 0.0 {
            PLAYER.damage_cooldown -= dt;
        }

        if PLAYER.speed_boost_active {
            PLAYER.speed_boost_timer -= dt;
            if PLAYER.speed_boost_timer <= 0.0 {
                PLAYER.speed_boost_active = false;
                PLAYER.shield_active = false;
                PLAYER.speed_boost_timer = 0.0;
            }
        }

        let mut move_x = 0.0;
        let mut move_y = 0.0;

        if (keys_bitmask & 1) != 0 { move_y -= 1.0; }
        if (keys_bitmask & 2) != 0 { move_y += 1.0; }
        if (keys_bitmask & 4) != 0 { move_x -= 1.0; }
        if (keys_bitmask & 8) != 0 { move_x += 1.0; }

        if joystick_x.abs() > 0.1 || joystick_y.abs() > 0.1 {
            move_x = joystick_x;
            move_y = joystick_y;
        }

        let move_len = (move_x * move_x + move_y * move_y).sqrt();
        if move_len > 0.0 {
            let mut speed = 4.5;
            if PLAYER.speed_boost_active {
                speed *= 1.5;
                // Spawn speed boost trail
                if random_f32() < 0.3 {
                    spawn_particle(
                        PLAYER.x + random_range(-10.0, 10.0),
                        PLAYER.y + random_range(-10.0, 10.0),
                        0.0, 0.0,
                        15.0,
                        random_range(6.0, 10.0),
                        7, // Sven speed boost trail
                    );
                }
            }
            PLAYER.x += (move_x / move_len) * speed * dt * 60.0;
            PLAYER.y += (move_y / move_len) * speed * dt * 60.0;
        }

        if PLAYER.x < 20.0 { PLAYER.x = 20.0; }
        if PLAYER.x > 1260.0 { PLAYER.x = 1260.0; }
        if PLAYER.y < 20.0 { PLAYER.y = 20.0; }
        if PLAYER.y > 700.0 { PLAYER.y = 700.0; }

        let aim_dx = mouse_x - PLAYER.x;
        let aim_dy = mouse_y - PLAYER.y;
        if aim_dx.abs() > 0.1 || aim_dy.abs() > 0.1 {
            PLAYER.angle = aim_dy.atan2(aim_dx);
        }

        // 3. MELEE SWING ATTACK
        if attack_melee {
            trigger_sound_wasm(1); // 'swing'
            
            for i in 0..MAX_ENEMIES {
                if ENEMIES[i].active {
                    let dx = ENEMIES[i].x - PLAYER.x;
                    let dy = ENEMIES[i].y - PLAYER.y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist < 95.0 {
                        ENEMIES[i].health -= 35.0;
                        trigger_sound_wasm(3); // 'hit'
                        
                        // Spawn melee blood splatters
                        for _ in 0..8 {
                            let vx = random_range(-2.5, 2.5);
                            let vy = random_range(-2.5, 2.5);
                            let color_idx = if random_f32() > 0.5 { 0 } else { 1 };
                            spawn_particle(ENEMIES[i].x, ENEMIES[i].y, vx, vy, 15.0, random_range(4.0, 8.0), color_idx);
                        }
                        
                        if dist > 0.0 {
                            ENEMIES[i].x += (dx / dist) * 20.0; // knockback aligned to 20 like JS
                            ENEMIES[i].y += (dy / dist) * 20.0;
                        }
                        
                        if ENEMIES[i].health <= 0.0 {
                            ENEMIES[i].active = false;
                            PLAYER.score += 150;
                            GAME_STATE.enemies_defeated += 1;
                            trigger_sound_wasm(4); // 'explode'
                            
                            // Spawn death explosion particles
                            for _ in 0..15 {
                                let vx = random_range(-4.0, 4.0);
                                let vy = random_range(-4.0, 4.0);
                                let color_idx = if random_f32() > 0.5 { 0 } else { 1 };
                                spawn_particle(ENEMIES[i].x, ENEMIES[i].y, vx, vy, 20.0, random_range(5.0, 10.0), color_idx);
                            }
                            
                            if ENEMIES[i].enemy_type == 5 {
                                GAME_STATE.horses_defeated += 1;
                            }

                            if random_f32() < 0.35 {
                                spawn_item_wasm(ENEMIES[i].x, ENEMIES[i].y, 0);
                            }

                            let req = get_required_enemies(GAME_STATE.level_index);
                            if req > 0 && GAME_STATE.enemies_defeated >= req {
                                GAME_STATE.portal_active = true;
                            }
                        }
                    }
                }
            }
        }

        // 4. RANGED THROW ATTACK
        if attack_ranged {
            if PLAYER.ammo_surstromming > 0 {
                PLAYER.ammo_surstromming -= 1;
                trigger_sound_wasm(2); // 'throw'
                
                let proj_speed = 8.0;
                let vx = PLAYER.angle.cos() * proj_speed;
                let vy = PLAYER.angle.sin() * proj_speed;
                spawn_projectile_wasm(PLAYER.x, PLAYER.y, vx, vy, 12.0, 0, 0, 100.0);
            }
        }

        // 5. UPDATE PROJECTILES
        for i in 0..MAX_PROJECTILES {
            if PROJECTILES[i].active {
                if PROJECTILES[i].proj_type == 2 { // GasCloud
                    PROJECTILES[i].life -= dt * 60.0;
                    
                    // Tick DoT (30.0 * dt per frame) on nearby enemies within radius (PROJECTILES[i].size)
                    for j in 0..MAX_ENEMIES {
                        if ENEMIES[j].active {
                            let dx = ENEMIES[j].x - PROJECTILES[i].x;
                            let dy = ENEMIES[j].y - PROJECTILES[i].y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            if dist < PROJECTILES[i].size {
                                damage_enemy_internal(j, 30.0 * dt);
                            }
                        }
                    }
                    
                    // Spawn green bubbles (palette index 8)
                    if random_f32() < 0.15 {
                        spawn_particle(
                            PROJECTILES[i].x + random_range(-PROJECTILES[i].size / 2.0, PROJECTILES[i].size / 2.0),
                            PROJECTILES[i].y + random_range(-PROJECTILES[i].size / 2.0, PROJECTILES[i].size / 2.0),
                            random_range(-0.5, 0.5), random_range(-1.0, -0.2),
                            20.0, random_range(3.0, 7.0), 8
                        );
                    }
                } else {
                    PROJECTILES[i].x += PROJECTILES[i].vx * dt * 60.0;
                    PROJECTILES[i].y += PROJECTILES[i].vy * dt * 60.0;
                    PROJECTILES[i].life -= dt * 60.0;
                }

                if PROJECTILES[i].life <= 0.0 || PROJECTILES[i].x < -50.0 || PROJECTILES[i].x > 1330.0 || PROJECTILES[i].y < -50.0 || PROJECTILES[i].y > 770.0 {
                    PROJECTILES[i].active = false;
                    continue;
                }

                if PROJECTILES[i].owner == 0 { // Player projectile hitting enemies
                    for j in 0..MAX_ENEMIES {
                        if ENEMIES[j].active {
                            let dx = ENEMIES[j].x - PROJECTILES[i].x;
                            let dy = ENEMIES[j].y - PROJECTILES[i].y;
                            let dist = (dx * dx + dy * dy).sqrt();
                            if dist < (PROJECTILES[i].size + ENEMIES[j].size) {
                                if PROJECTILES[i].proj_type == 0 { // Surstromming Can
                                    PROJECTILES[i].active = false;
                                    trigger_sound_wasm(4); // 'explode'
                                    spawn_projectile_wasm(PROJECTILES[i].x, PROJECTILES[i].y, 0.0, 0.0, 80.0, 2, 0, 45.0);
                                    damage_enemy_internal(j, 45.0);
                                } else {
                                    PROJECTILES[i].active = false;
                                    trigger_sound_wasm(3); // 'hit'
                                    damage_enemy_internal(j, 25.0);
                                }
                                break;
                            }
                        }
                    }
                } else { // Enemy projectile hitting player
                    let dx = PLAYER.x - PROJECTILES[i].x;
                    let dy = PLAYER.y - PROJECTILES[i].y;
                    let dist = (dx * dx + dy * dy).sqrt();
                    if dist < (PROJECTILES[i].size + 20.0) {
                        if PLAYER.damage_cooldown <= 0.0 {
                            let mut dmg = get_projectile_damage(PROJECTILES[i].proj_type);
                            if PLAYER.shield_active {
                                dmg *= 0.2;
                            }
                            PLAYER.health -= dmg;
                            PLAYER.damage_cooldown = 1.0;
                            trigger_sound_wasm(3); // 'hit'
                            PROJECTILES[i].active = false;
                            
                            if PLAYER.health <= 0.0 {
                                GAME_STATE.game_over = true;
                                trigger_sound_wasm(7); // 'lose'
                            }
                        }
                    }
                }
            }
        }

        // 6. UPDATE ENEMIES
        for i in 0..MAX_ENEMIES {
            if ENEMIES[i].active {
                let dx = PLAYER.x - ENEMIES[i].x;
                let dy = PLAYER.y - ENEMIES[i].y;
                let dist = (dx * dx + dy * dy).sqrt();

                match ENEMIES[i].enemy_type {
                    0 => { // Shopper (simple tracking)
                        if dist > 0.0 {
                            ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].angle = dy.atan2(dx);
                        }
                    }
                    1 => { // Drunkard (slow move, throw bottle)
                        ENEMIES[i].state_timer -= dt;
                        if ENEMIES[i].state_timer <= 0.0 {
                            if dist > 0.0 {
                                let b_speed = 5.0;
                                let b_vx = (dx / dist) * b_speed;
                                let b_vy = (dy / dist) * b_speed;
                                spawn_projectile_wasm(ENEMIES[i].x, ENEMIES[i].y, b_vx, b_vy, 10.0, 3, 1, 150.0);
                                trigger_sound_wasm(2); // 'throw'
                            }
                            ENEMIES[i].state_timer = random_range(2.0, 5.0);
                        }
                        if dist > 0.0 {
                            ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].angle = dy.atan2(dx);
                        }
                    }
                    2 => { // CandyKid (move fast, throw candy)
                        ENEMIES[i].state_timer -= dt;
                        if ENEMIES[i].state_timer <= 0.0 {
                            if dist > 0.0 {
                                let c_speed = 6.0;
                                let c_vx = (dx / dist) * c_speed;
                                let c_vy = (dy / dist) * c_speed;
                                spawn_projectile_wasm(ENEMIES[i].x, ENEMIES[i].y, c_vx, c_vy, 8.0, 8, 1, 100.0);
                                trigger_sound_wasm(2); // 'throw'
                            }
                            ENEMIES[i].state_timer = random_range(1.5, 3.0);
                        }
                        if dist > 0.0 {
                            ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].angle = dy.atan2(dx);
                        }
                    }
                    3 => { // ZappaFan (floats, throws note)
                        ENEMIES[i].state_timer -= dt;
                        if ENEMIES[i].state_timer <= 0.0 {
                            if dist > 0.0 {
                                let n_speed = 4.0;
                                let n_vx = (dx / dist) * n_speed;
                                let n_vy = (dy / dist) * n_speed;
                                spawn_projectile_wasm(ENEMIES[i].x, ENEMIES[i].y, n_vx, n_vy, 10.0, 4, 1, 160.0);
                            }
                            ENEMIES[i].state_timer = random_range(2.0, 4.0);
                        }
                        if dist > 0.0 {
                            ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                        }
                    }
                    4 => { // VolvoCar (moves straight horizontally)
                        ENEMIES[i].x += ENEMIES[i].vx * dt * 60.0;
                        if ENEMIES[i].x < -100.0 || ENEMIES[i].x > 1380.0 {
                            ENEMIES[i].active = false;
                        }
                    }
                    5 => { // DalarnaHorse
                        if ENEMIES[i].state == 0 { // Wander
                            if dist > 0.0 {
                                ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                                ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                                ENEMIES[i].angle = dy.atan2(dx);
                            }
                            ENEMIES[i].state_timer -= dt;
                            if ENEMIES[i].state_timer <= 0.0 && dist < 300.0 {
                                ENEMIES[i].state = 1;
                                ENEMIES[i].state_timer = 0.6; // 600ms
                                let safe_dist = if dist > 0.0 { dist } else { 1.0 };
                                ENEMIES[i].vx = dx / safe_dist;
                                ENEMIES[i].vy = dy / safe_dist;
                            }
                        } else { // Dash
                            ENEMIES[i].x += ENEMIES[i].vx * 5.5 * dt * 60.0;
                            ENEMIES[i].y += ENEMIES[i].vy * 5.5 * dt * 60.0;
                            
                            // Spawn little red run trails at 30% rate
                            if random_f32() < 0.3 {
                                spawn_particle(
                                    ENEMIES[i].x, ENEMIES[i].y,
                                    0.0, 0.0,
                                    15.0, random_range(4.0, 8.0),
                                    0, // Red run trail
                                );
                            }
                            
                            ENEMIES[i].state_timer -= dt;
                            if ENEMIES[i].state_timer <= 0.0 {
                                ENEMIES[i].state = 0;
                                ENEMIES[i].state_timer = random_range(1.0, 3.0);
                            }
                        }
                    }
                    6 => { // Elk state machine
                        if ENEMIES[i].state == 0 { // Walk
                            if dist > 0.0 {
                                ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                                ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                                ENEMIES[i].angle = dy.atan2(dx);
                            }
                            ENEMIES[i].state_timer -= dt;
                            if ENEMIES[i].state_timer <= 0.0 && dist < 350.0 {
                                ENEMIES[i].state = 1;
                                ENEMIES[i].state_timer = 0.8; // 800ms warning / steam
                            }
                        } else if ENEMIES[i].state == 1 { // Prep
                            ENEMIES[i].state_timer -= dt;
                            if random_f32() < 0.25 {
                                let face_dir = if dx > 0.0 { 1.0 } else { -1.0 };
                                spawn_particle(
                                    ENEMIES[i].x + 18.0 * face_dir, ENEMIES[i].y - 10.0,
                                    face_dir * (random_f32() * 1.5 + 0.5), -random_f32() * 1.0,
                                    15.0, random_range(4.0, 8.0),
                                    4 // nose steam puff
                                );
                            }
                            if ENEMIES[i].state_timer <= 0.0 {
                                ENEMIES[i].state = 2;
                                ENEMIES[i].state_timer = 0.7; // 700ms charge
                                let safe_dist = if dist > 0.0 { dist } else { 1.0 };
                                ENEMIES[i].vx = (dx / safe_dist) * 6.5;
                                ENEMIES[i].vy = (dy / safe_dist) * 6.5;
                            }
                        } else if ENEMIES[i].state == 2 { // Charge
                            ENEMIES[i].x += ENEMIES[i].vx * dt * 60.0;
                            ENEMIES[i].y += ENEMIES[i].vy * dt * 60.0;
                            ENEMIES[i].state_timer -= dt;
                            
                            // Spawn trail particles at 40% rate
                            if random_f32() < 0.4 {
                                spawn_particle(
                                    ENEMIES[i].x, ENEMIES[i].y + 10.0,
                                    -ENEMIES[i].vx * 0.2, random_range(-0.75, 0.75),
                                    15.0, random_range(4.0, 8.0),
                                    5 // charging trail dust
                                );
                            }
                            
                            let hit_wall = ENEMIES[i].x <= 20.0 || ENEMIES[i].x >= 1260.0 || ENEMIES[i].y <= 25.0 || ENEMIES[i].y >= 695.0;
                            if ENEMIES[i].state_timer <= 0.0 || hit_wall {
                                ENEMIES[i].state = 3;
                                ENEMIES[i].state_timer = 0.5; // stomp animation (500ms)
                                
                                trigger_sound_wasm(3); // hit
                                
                                if dist < 75.0 {
                                    let mut dmg = 12.0;
                                    if PLAYER.shield_active {
                                        dmg *= 0.2;
                                    }
                                    PLAYER.health -= dmg;
                                    
                                    // Push back
                                    let p_push_x = if dx > 0.0 { 15.0 } else { -15.0 };
                                    let p_push_y = if dy > 0.0 { 15.0 } else { -15.0 };
                                    PLAYER.x += p_push_x;
                                    PLAYER.y += p_push_y;
                                    
                                    if PLAYER.health <= 0.0 {
                                        GAME_STATE.game_over = true;
                                        trigger_sound_wasm(7); // 'lose'
                                    }
                                }
                                
                                // Shockwave dirt particles
                                for _ in 0..18 {
                                    let angle = random_f32() * std::f32::consts::TAU;
                                    let speed = random_f32() * 3.5 + 1.5;
                                    spawn_particle(
                                        ENEMIES[i].x, ENEMIES[i].y + 15.0,
                                        angle.cos() * speed, angle.sin() * speed,
                                        25.0, random_range(5.0, 10.0),
                                        6 // stomp dirt shockwave
                                    );
                                }
                            }
                        } else if ENEMIES[i].state == 3 { // Stomp
                            ENEMIES[i].state_timer -= dt;
                            if ENEMIES[i].state_timer <= 0.0 {
                                ENEMIES[i].state = 0;
                                ENEMIES[i].state_timer = random_range(2.0, 4.0);
                            }
                        }
                    }
                    7 | 8 | 9 => { // Guard, Raver, ABBAbot standard tracking & ranged
                        if dist > 0.0 {
                            ENEMIES[i].x += (dx / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].y += (dy / dist) * ENEMIES[i].speed * dt * 60.0;
                            ENEMIES[i].angle = dy.atan2(dx);
                        }
                        
                        ENEMIES[i].state_timer -= dt;
                        if ENEMIES[i].state_timer <= 0.0 {
                            if ENEMIES[i].enemy_type == 7 && dist > 0.0 { // Guard (Handcuffs 7)
                                let vx = (dx / dist) * 5.0;
                                let vy = (dy / dist) * 5.0;
                                spawn_projectile_wasm(ENEMIES[i].x, ENEMIES[i].y, vx, vy, 11.0, 7, 1, 150.0);
                                trigger_sound_wasm(2);
                            } else if ENEMIES[i].enemy_type == 8 && dist > 0.0 { // Raver (Glowstick 6)
                                let vx = (dx / dist) * 6.5;
                                let vy = (dy / dist) * 6.5;
                                spawn_projectile_wasm(ENEMIES[i].x, ENEMIES[i].y, vx, vy, 9.0, 6, 1, 120.0);
                            } else if ENEMIES[i].enemy_type == 9 && dist > 0.0 { // ABBAbot (LaserBall 5)
                                let vx = (dx / dist) * 6.0;
                                let vy = (dy / dist) * 6.0;
                                spawn_projectile_wasm(ENEMIES[i].x, ENEMIES[i].y, vx, vy, 14.0, 5, 1, 180.0);
                                trigger_sound_wasm(4);
                            }
                            ENEMIES[i].state_timer = random_range(2.0, 4.5);
                        }
                    }
                    _ => {}
                }

                // Keep enemies in-bounds (except Volvo type 4)
                if ENEMIES[i].enemy_type != 4 {
                    if ENEMIES[i].x < 20.0 { ENEMIES[i].x = 20.0; }
                    if ENEMIES[i].x > 1260.0 { ENEMIES[i].x = 1260.0; }
                    if ENEMIES[i].y < 25.0 { ENEMIES[i].y = 25.0; }
                    if ENEMIES[i].y > 695.0 { ENEMIES[i].y = 695.0; }
                }

                // Hit player check
                let dx = PLAYER.x - ENEMIES[i].x;
                let dy = PLAYER.y - ENEMIES[i].y;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist < (ENEMIES[i].size + 20.0) {
                    if PLAYER.damage_cooldown <= 0.0 {
                        let mut dmg = if ENEMIES[i].enemy_type == 4 { 40.0 } else { 15.0 };
                        if PLAYER.shield_active {
                            dmg *= 0.2;
                        }
                        PLAYER.health -= dmg;
                        PLAYER.damage_cooldown = 1.0;
                        trigger_sound_wasm(3); // 'hit'
                        
                        if PLAYER.health <= 0.0 {
                            GAME_STATE.game_over = true;
                            trigger_sound_wasm(7); // 'lose'
                        }
                    }
                }
            }
        }

        // 7. PLAYER VS ITEMS
        for i in 0..MAX_ITEMS {
            if ITEMS[i].active {
                let dx = PLAYER.x - ITEMS[i].x;
                let dy = PLAYER.y - ITEMS[i].y;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist < 35.0 {
                    ITEMS[i].active = false;
                    trigger_sound_wasm(5); // 'powerup'
                    
                    if ITEMS[i].item_type == 0 { // Meatball
                        PLAYER.health += 25.0;
                        if PLAYER.health > PLAYER.max_health {
                            PLAYER.health = PLAYER.max_health;
                        }
                        GAME_STATE.meatballs_collected += 1;
                        PLAYER.score += 250;
                        
                        // Spawn 10 red sparkles (color index 0/1)
                        for _ in 0..10 {
                            let vx = random_range(-2.5, 2.5);
                            let vy = random_range(-2.5, 2.5);
                            let color_idx = if random_f32() > 0.5 { 0 } else { 1 };
                            spawn_particle(ITEMS[i].x, ITEMS[i].y, vx, vy, 15.0, random_range(4.0, 8.0), color_idx);
                        }
                    } else { // Knackebrod
                        PLAYER.speed_boost_active = true;
                        PLAYER.shield_active = true;
                        PLAYER.speed_boost_timer = 4.0;
                        PLAYER.score += 150;
                        
                        // Spawn 10 green/gold sparkles (color index 8)
                        for _ in 0..10 {
                            let vx = random_range(-2.5, 2.5);
                            let vy = random_range(-2.5, 2.5);
                            spawn_particle(ITEMS[i].x, ITEMS[i].y, vx, vy, 15.0, random_range(4.0, 8.0), 8);
                        }
                    }
                }
            }
        }

        // 8. NATIVE Dynamic Spawners
        let mut active_enemies_count = 0;
        for i in 0..MAX_ENEMIES {
            if ENEMIES[i].active {
                active_enemies_count += 1;
            }
        }

        if GAME_STATE.level_index == 4 { // Volvo highway
            if random_f32() < 0.02 {
                let lane = (random_f32() * 4.0) as i32;
                let lane_y = 130.0 + (lane as f32) * 80.0;
                let left_to_right = random_f32() > 0.5;
                let ex = if left_to_right { -60.0 } else { 1340.0 };
                let (hp, size, speed) = get_enemy_stats(4);
                spawn_enemy_wasm(ex, lane_y, 4, hp, size, speed);
            }
        } else {
            if active_enemies_count < 5 && random_f32() < 0.008 {
                let ex = 1330.0;
                let ey = random_range(50.0, 620.0);
                let etype = GAME_STATE.level_index;
                let (hp, size, speed) = get_enemy_stats(etype);
                spawn_enemy_wasm(ex, ey, etype, hp, size, speed);
            }
        }

        let mut active_items_count = 0;
        for i in 0..MAX_ITEMS {
            if ITEMS[i].active {
                active_items_count += 1;
            }
        }
        if active_items_count < 2 && random_f32() < 0.003 {
            let item_type = if random_f32() > 0.4 { 0 } else { 1 };
            let ix = random_range(150.0, 1100.0);
            let iy = random_range(100.0, 620.0);
            spawn_item_wasm(ix, iy, item_type);
        }
    }
}

// Helpers
fn damage_enemy_internal(idx: usize, amount: f32) {
    unsafe {
        ENEMIES[idx].health -= amount;
        if ENEMIES[idx].health <= 0.0 {
            ENEMIES[idx].active = false;
            PLAYER.score += 150;
            GAME_STATE.enemies_defeated += 1;
            trigger_sound_wasm(4); // 'explode'
            
            if ENEMIES[idx].enemy_type == 5 {
                GAME_STATE.horses_defeated += 1;
            }

            if random_f32() < 0.35 {
                spawn_item_wasm(ENEMIES[idx].x, ENEMIES[idx].y, 0);
            }

            let req = get_required_enemies(GAME_STATE.level_index);
            if req > 0 && GAME_STATE.enemies_defeated >= req {
                GAME_STATE.portal_active = true;
            }
        }
    }
}

fn get_required_enemies(lvl_idx: i32) -> i32 {
    match lvl_idx {
        0 => 5,
        1 => 6,
        2 => 7,
        3 => 7,
        4 => 0, // Volvo highway survival crossing
        5 => 8,
        6 => 8,
        7 => 8,
        8 => 8,
        9 => 10,
        _ => 5,
    }
}

// --- WASM GETTERS & SETTERS FOR JAVASCRIPT BRIDGING ---

#[no_mangle]
pub extern "C" fn get_player_x() -> f32 { unsafe { PLAYER.x } }
#[no_mangle]
pub extern "C" fn get_player_y() -> f32 { unsafe { PLAYER.y } }
#[no_mangle]
pub extern "C" fn get_player_health() -> f32 { unsafe { PLAYER.health } }
#[no_mangle]
pub extern "C" fn get_player_max_health() -> f32 { unsafe { PLAYER.max_health } }
#[no_mangle]
pub extern "C" fn get_player_surstromming() -> i32 { unsafe { PLAYER.ammo_surstromming } }
#[no_mangle]
pub extern "C" fn get_player_flatpack() -> i32 { unsafe { PLAYER.ammo_flatpack } }
#[no_mangle]
pub extern "C" fn get_player_score() -> i32 { unsafe { PLAYER.score } }
#[no_mangle]
pub extern "C" fn get_player_angle() -> f32 { unsafe { PLAYER.angle } }
#[no_mangle]
pub extern "C" fn get_player_cooldown() -> f32 { unsafe { PLAYER.damage_cooldown } }

#[no_mangle]
pub extern "C" fn set_player_x(val: f32) { unsafe { PLAYER.x = val; } }
#[no_mangle]
pub extern "C" fn set_player_y(val: f32) { unsafe { PLAYER.y = val; } }
#[no_mangle]
pub extern "C" fn set_player_health(val: f32) { unsafe { PLAYER.health = val; } }
#[no_mangle]
pub extern "C" fn set_player_surstromming(val: i32) { unsafe { PLAYER.ammo_surstromming = val; } }
#[no_mangle]
pub extern "C" fn set_player_score(val: i32) { unsafe { PLAYER.score = val; } }

#[no_mangle]
pub extern "C" fn get_enemies_max_count() -> i32 { MAX_ENEMIES as i32 }
#[no_mangle]
pub extern "C" fn get_enemy_active(idx: i32) -> bool { unsafe { ENEMIES[idx as usize].active } }
#[no_mangle]
pub extern "C" fn get_enemy_x(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].x } }
#[no_mangle]
pub extern "C" fn get_enemy_y(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].y } }
#[no_mangle]
pub extern "C" fn get_enemy_size(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].size } }
#[no_mangle]
pub extern "C" fn get_enemy_type(idx: i32) -> i32 { unsafe { ENEMIES[idx as usize].enemy_type } }
#[no_mangle]
pub extern "C" fn get_enemy_health(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].health } }
#[no_mangle]
pub extern "C" fn get_enemy_max_health(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].max_health } }
#[no_mangle]
pub extern "C" fn get_enemy_angle(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].angle } }

#[no_mangle]
pub extern "C" fn get_projectiles_max_count() -> i32 { MAX_PROJECTILES as i32 }
#[no_mangle]
pub extern "C" fn get_projectile_active(idx: i32) -> bool { unsafe { PROJECTILES[idx as usize].active } }
#[no_mangle]
pub extern "C" fn get_projectile_x(idx: i32) -> f32 { unsafe { PROJECTILES[idx as usize].x } }
#[no_mangle]
pub extern "C" fn get_projectile_y(idx: i32) -> f32 { unsafe { PROJECTILES[idx as usize].y } }
#[no_mangle]
pub extern "C" fn get_projectile_size(idx: i32) -> f32 { unsafe { PROJECTILES[idx as usize].size } }
#[no_mangle]
pub extern "C" fn get_projectile_type(idx: i32) -> i32 { unsafe { PROJECTILES[idx as usize].proj_type } }

#[no_mangle]
pub extern "C" fn get_items_max_count() -> i32 { MAX_ITEMS as i32 }
#[no_mangle]
pub extern "C" fn get_item_active(idx: i32) -> bool { unsafe { ITEMS[idx as usize].active } }
#[no_mangle]
pub extern "C" fn get_item_x(idx: i32) -> f32 { unsafe { ITEMS[idx as usize].x } }
#[no_mangle]
pub extern "C" fn get_item_y(idx: i32) -> f32 { unsafe { ITEMS[idx as usize].y } }
#[no_mangle]
pub extern "C" fn get_item_type(idx: i32) -> i32 { unsafe { ITEMS[idx as usize].item_type } }

#[no_mangle]
pub extern "C" fn get_level_timer_wasm() -> f32 { unsafe { GAME_STATE.level_timer } }
#[no_mangle]
pub extern "C" fn set_level_timer_wasm(val: f32) { unsafe { GAME_STATE.level_timer = val; } }
#[no_mangle]
pub extern "C" fn get_enemies_defeated_wasm() -> i32 { unsafe { GAME_STATE.enemies_defeated } }
#[no_mangle]
pub extern "C" fn is_portal_active_wasm() -> bool { unsafe { GAME_STATE.portal_active } }
#[no_mangle]
pub extern "C" fn set_portal_active_wasm(val: bool) { unsafe { GAME_STATE.portal_active = val; } }
#[no_mangle]
pub extern "C" fn is_level_completed_wasm() -> bool { unsafe { GAME_STATE.level_completed } }
#[no_mangle]
pub extern "C" fn set_level_completed_wasm(val: bool) { unsafe { GAME_STATE.level_completed = val; } }
#[no_mangle]
pub extern "C" fn is_game_over_wasm() -> bool { unsafe { GAME_STATE.game_over } }
#[no_mangle]
pub extern "C" fn set_game_over_wasm(val: bool) { unsafe { GAME_STATE.game_over = val; } }
#[no_mangle]
pub extern "C" fn get_meatballs_collected() -> i32 { unsafe { GAME_STATE.meatballs_collected } }
#[no_mangle]
pub extern "C" fn get_horses_defeated() -> i32 { unsafe { GAME_STATE.horses_defeated } }

#[no_mangle]
pub extern "C" fn get_player_speed_boost_active() -> bool { unsafe { PLAYER.speed_boost_active } }
#[no_mangle]
pub extern "C" fn get_player_shield_active() -> bool { unsafe { PLAYER.shield_active } }
#[no_mangle]
pub extern "C" fn get_enemy_state(idx: i32) -> i32 { unsafe { ENEMIES[idx as usize].state } }
#[no_mangle]
pub extern "C" fn get_enemy_state_timer(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].state_timer } }
#[no_mangle]
pub extern "C" fn get_enemy_vx(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].vx } }
#[no_mangle]
pub extern "C" fn get_enemy_vy(idx: i32) -> f32 { unsafe { ENEMIES[idx as usize].vy } }

