package main

import (
	"bytes"
	"embed"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"time"
)

// --- Configuration ---

type Config struct {
	Port                   int  `json:"port"`
	TrackerIntervalSeconds int  `json:"trackerIntervalSeconds"`
	AutoTrackDefault       bool `json:"autoTrackDefault"`
	HostInNetwork          bool `json:"hostInNetwork"`
}

// --- Embedding ---

//go:embed static/*
var staticEmbed embed.FS

//go:embed data/*
var dataEmbed embed.FS

// --- Data Structures ---

// ShineDefinition tracks the state and metadata of a specific shine.
type ShineDefinition struct {
	ID   string `json:"id"` // Unique ID used for tracking logic
	Name string `json:"name"`
}

// Exit represents a loading zone or transition point within the game world.
type Exit struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Zone represents a major level or area the player can warp to.
type Zone struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	ShinesAvailable []ShineDefinition `json:"shines_available"`
	Exits           []Exit            `json:"exits"`
	BlueCoinIDs     []string          `json:"blue_coin_ids"`
}

type BlueCoinDefinition struct {
	ID                   string `json:"id"`
	Title                string `json:"title"`
	Episode              []int  `json:"episode"`
	EpisodeString        string `json:"episodeString"`
	MarioPartyLegacyLink string `json:"mariopartylegacylink"`
}

// Unlock represents a game capability, item, or nozzle.
type Unlock struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Icon string `json:"icon"`
}

// PlazaShines defines a specific entry point from the hub world (Plaza) to a level.
type PlazaShines struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	GroupName string `json:"group_name"` // Used for grouping in the UI (e.g., "Bianco Hills")
	Image     string `json:"image"`
	IsWarp    bool   `json:"is_warp"`
}

// WorldData serves as the root container for all static game configuration loaded from JSON.
type WorldData struct {
	Zones          map[string]Zone      `json:"zones"`
	Unlocks        []Unlock             `json:"unlocks"`
	PlazaEntrances []PlazaShines        `json:"plaza_entrances"`
	BlueCoins      []BlueCoinDefinition `json:"blue_coins"`
}

// MemoryState for API Output
type MemoryState struct {
	IsHooked       bool            `json:"is_hooked"`
	CurrentLevel   string          `json:"current_level"`
	LevelAddress   string          `json:"level_address"`
	CurrentEpisode string          `json:"current_episode"`
	EpisodeAddress string          `json:"episode_address"`
	EpisodeNumber  int             `json:"episode_number"`
	Unlocks        map[string]bool `json:"unlocks"`
	// Configvalues for Memory State
	Interval  int  `json:"interval"`
	AutoTrack bool `json:"auto_track"`
}

// --- Dolphin Hook Logic ---

const (
	PROCESS_VM_READ           = 0x0010
	PROCESS_QUERY_INFORMATION = 0x0400
	ADDR_SKILLS               = 0x804496AF
	ADDR_SHINES               = ADDR_SKILLS + 0x19 // We will use this maybe at some point to show which shine will unlock a skill
)

// Possible Levelnames the Hook can find
var levels = []string{
	"BIANCO HILLS", "RICCO HARBOR", "GELATO BEACH", "PINNA PARK",
	"SIRENA BEACH", "PIANTA VILLAGE", "NOKI BAY", "CORONA MOUNTAIN",
	"DELFINO PLAZA", "AIRSTRIP",
}

// Skill names the hook can give to the tracker
var skillNames = []string{
	"DOUBLE_JUMP", "TRIPLE_JUMP", "SIDEFLIP", "GRAB", "GROUND_SPIN",
	"SPIN_JUMP", "DIVE", "WALL_KICKS", "GROUND_POUND", "Y_CAMERA",
	"TALKING", "SHINE_SHIRT", "SUNGLASSES", "HELMET", "YOSHI",
	"BLOOPER", "TOROCCO", "SPRAY", "SPAM_SPRAY", "HOVER",
	"ROCKET", "TURBO", "CLIMBING",
}

// DolphinHookManager manages the connection and memory reading from the Dolphin emulator.
type DolphinHookManager struct {
	PID            uint32
	Handle         uintptr
	BaseAddr       uintptr
	IsHooked       bool
	CurrentLevel   string
	CurrentEpisode string
	LevelAddress   uint32
	EpisodeAddress uint32
	EpisodeNumber  int
	LastSkills     []byte
}

// SyncLocation scans the game's memory to determine the current level and episode.
func (d *DolphinHookManager) SyncLocation() {
	blockSize := 0x400000
	for i := 0; i < 6; i++ {
		offset := uint32(i) * uint32(blockSize)
		data, err := d.Read(0x80000000+offset, blockSize)
		if err != nil || data == nil {
			fmt.Println("Failed to read memory block:", err)
			continue
		}
		for _, name := range levels {
			idx := bytes.Index(data, []byte(name))
			if idx != -1 {
				absAddr := 0x80000000 + offset + uint32(idx)
				if absAddr >= 0x8096A200 && absAddr <= 0x8096A300 {
					continue
				}
				d.CurrentLevel = name
				d.LevelAddress = absAddr
				searchArea := data[max(0, idx-1024):idx]
				d.CurrentEpisode, d.EpisodeAddress = findMostLikelyMission(searchArea)
				d.EpisodeNumber = 0 // Implementation pending based on specific game logic
				return
			}
		}
	}
}

// --- Global State ---

var (
	currentWorld WorldData
	dm           = &DolphinHookManager{CurrentLevel: "SEARCHING..."}
	globalCfg    Config
)

// --- Helper Functions ---

func findMostLikelyMission(data []byte) (string, uint32) {
	parts := bytes.Split(data, []byte{0x00})
	for i := len(parts) - 1; i >= 0; i-- {
		p := bytes.TrimSpace(parts[i])
		if len(p) > 4 && len(p) < 40 {
			isASCII := true
			for _, b := range p {
				if b < 32 || b > 126 {
					isASCII = false
					break
				}
			}
			if isASCII {
				return string(p), binary.BigEndian.Uint32(data)
			}
		}
	}
	return "???", 0
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// --- Main Logic ---

// loadGameData parses JSON files and constructs the initial world state.
// This should only be called once during startup.
func loadGameData() {
	// A. Load Zones
	zoneFile, err := dataEmbed.ReadFile("data/zones.json")
	if err != nil {
		log.Fatalf("Error reading embedded zones.json: %v", err)
	}

	// Temporary wrapper to match the JSON structure structure
	var zoneWrapper struct {
		Zones map[string]Zone `json:"zones"`
	}

	if err := json.Unmarshal(zoneFile, &zoneWrapper); err != nil {
		log.Fatalf("Error parsing zones.json: %v", err)
	}

	// The JSON uses the ID as the map key. We inject that key into the struct itself
	// so the frontend receives a fully self-contained object.
	for id, zone := range zoneWrapper.Zones {
		zone.ID = id
		zoneWrapper.Zones[id] = zone
	}

	// B. Load Unlocks
	unlockFile, err := dataEmbed.ReadFile("data/unlocks.json")
	if err != nil {
		log.Fatalf("Error reading embedded unlocks.json: %v", err)
	}

	var unlockWrapper struct {
		Unlocks []Unlock `json:"unlocks"`
	}
	if err := json.Unmarshal(unlockFile, &unlockWrapper); err != nil {
		log.Fatalf("Error parsing unlocks.json: %v", err)
	}

	// C. Define Plaza Entrances programmatically
	var entrances []PlazaShines
	// 1. Plaza stuff
	singles := []struct {
		ID, Name, Image string
		isWarp          bool
	}{
		{"enter_corona", "Corona Mountain", "corona.png", true},
	}

	for _, s := range singles {
		entrances = append(entrances, PlazaShines{
			ID:        s.ID,
			Name:      s.Name,
			GroupName: "Plaza: Special & Secrets",
			Image:     s.Image,
			IsWarp:    s.isWarp,
		})
	}

	// 2. Main Worlds (Generate entries for Episodes 1-8)
	worlds := []struct {
		ID, Name, Image string
	}{
		{"bianco", "Bianco Hills", "bianco_entry.png"},
		{"ricco", "Ricco Harbor", "ricco_entry.png"},
		{"gelato", "Gelato Beach", "gelato_entry.png"},
		{"pinna", "Pinna Park", "pinna_entry.png"},
		{"sirena", "Sirena Beach", "sirena_entry.png"},
		{"noki", "Noki Bay", "noki_entry.png"},
		{"pianta", "Pianta Village", "pianta_entry.png"},
	}

	for _, w := range worlds {
		for ep := 1; ep <= 8; ep++ {
			entrances = append(entrances, PlazaShines{
				ID:        fmt.Sprintf("enter_%s_ep%d", w.ID, ep),
				Name:      fmt.Sprintf("Episode %d", ep),
				GroupName: w.Name,
				Image:     w.Image,
				IsWarp:    true,
			})
		}
	}

	// D. Load Blue Coins
	bcFile, err := dataEmbed.ReadFile("data/blue_coin.json")
	if err != nil {
		log.Printf("Warning: Could not find blue_coin.json: %v", err)
	}

	var blueCoins []BlueCoinDefinition
	if bcFile != nil {
		if err := json.Unmarshal(bcFile, &blueCoins); err != nil {
			log.Printf("Error parsing blue_coins.json: %v", err)
		}
	}

	// Assign compiled data to global state
	currentWorld = WorldData{
		Zones:          zoneWrapper.Zones,
		Unlocks:        unlockWrapper.Unlocks,
		PlazaEntrances: entrances,
		BlueCoins:      blueCoins,
	}

	fmt.Printf("Data loaded successfully: %d zones, %d entrances configured, %d unlocks, %d blue coins.\n",
		len(currentWorld.Zones), len(currentWorld.PlazaEntrances), len(currentWorld.Unlocks), len(currentWorld.BlueCoins))
}

// --- Server API ---

func LoadConfig() Config {
	defaultConfig := Config{Port: 8080, TrackerIntervalSeconds: 5, AutoTrackDefault: true, HostInNetwork: false}
	file, err := os.ReadFile("config.json")
	if err != nil {
		// If file doesn't exist, write the file then load defaults
		if os.IsNotExist(err) {
			configData, _ := json.MarshalIndent(defaultConfig, "", "  ")
			writeErr := os.WriteFile("config.json", configData, 0644)
			if writeErr != nil {
				log.Fatalf("Error creating default config.json: %v", writeErr)
			} else {
				fmt.Println("Created default config.json")
			}
		} else {
			log.Fatalf("Error reading config.json: %v", err)
		}
		return defaultConfig
	}
	var loadedConfig Config
	if err := json.Unmarshal(file, &loadedConfig); err != nil {
		fmt.Printf("Warning: Failed to parse config.json, using default port %d\n", defaultConfig.Port)
		return defaultConfig
	}
	return loadedConfig
}
func runMemoryScanner() {
	for {
		if !dm.IsHooked {
			if !dm.Hook() {
				time.Sleep(2 * time.Second)
				continue
			}
			fmt.Println("Successfully hooked to Dolphin!")
		}

		dm.SyncLocation()
		s, err := dm.Read(ADDR_SKILLS, 23)

		if err != nil || s == nil {
			fmt.Println("Connection lost to Dolphin, cleaning up...")

			dm.Close()

			dm.IsHooked = false
			time.Sleep(1 * time.Second)
			continue
		}

		dm.LastSkills = s
		// Wait before next scan
		time.Sleep(500 * time.Millisecond)
	}
}

func main() {
	globalCfg = LoadConfig()
	loadGameData()

	go runMemoryScanner()

	publicFiles, err := fs.Sub(staticEmbed, "static")
	if err != nil {
		log.Fatal(err)
	}

	http.Handle("/", http.FileServer(http.FS(publicFiles)))

	http.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		err = json.NewEncoder(w).Encode(currentWorld)
		if err != nil {
			http.Error(w, "Failed to encode data", http.StatusInternalServerError)
		}
	})

	http.HandleFunc("/api/memory", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		unlockMap := make(map[string]bool)
		if dm.LastSkills != nil {
			for i, name := range skillNames {
				if i < len(dm.LastSkills) {
					unlockMap[name] = dm.LastSkills[i] != 0
				}
			}
		}

		state := MemoryState{
			IsHooked:       dm.IsHooked,
			CurrentLevel:   dm.CurrentLevel,
			LevelAddress:   fmt.Sprintf("0x%08X", dm.LevelAddress),
			CurrentEpisode: dm.CurrentEpisode,
			EpisodeAddress: fmt.Sprintf("0x%08X", dm.EpisodeAddress),
			EpisodeNumber:  dm.EpisodeNumber,
			Unlocks:        unlockMap,
			Interval:       globalCfg.TrackerIntervalSeconds,
			AutoTrack:      globalCfg.AutoTrackDefault,
		}
		err = json.NewEncoder(w).Encode(state)
		if err != nil {
			http.Error(w, "Failed to encode memory state", http.StatusInternalServerError)
		}
	})

	addr := fmt.Sprintf("localhost:%d", globalCfg.Port)
	addrStr := []string{"localhost"}
	if globalCfg.HostInNetwork {

		addr = fmt.Sprintf("0.0.0.0:%d", globalCfg.Port)
		localIPs := getLocalIPs()
		addrStr = append(addrStr, localIPs...)

	}
	fmt.Println("Starting server... Web interface available at:")

	for i, a := range addrStr {
		if i == 1 {
			if globalCfg.HostInNetwork {
				fmt.Println(" - Listening on all interfaces. - UI is also available in local network at:")
			}
		}
		fmt.Printf(" - http://%s:%d\n", a, globalCfg.Port)

	}
	fmt.Printf("Open your web browser and navigate to the above URL to access the tracker interface.\n")
	fmt.Printf("You can alternativly open the link by holding Ctrl and clicking it in supported terminals.\n")
	fmt.Println("Press Ctrl+C to stop the server.")
	log.Fatal(http.ListenAndServe(addr, nil))
}

func getLocalIPs() []string {
	var ips []string
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}

	for _, addr := range addresses {
		// Check the address type and ensure it's not a loopback (127.0.0.1)
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				ips = append(ips, ipnet.IP.String())
			}
		}
	}
	return ips
}
