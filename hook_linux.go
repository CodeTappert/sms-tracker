//go:build linux

package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

type iovec struct {
	addr uintptr
	len  uint
}

// Read reads memory from the Dolphin emulator using process_vm_readv.
func (d *DolphinHookManager) Read(gcAddress uint32, size int) ([]byte, error) {
	if !d.IsHooked {
		return nil, fmt.Errorf("not hooked")
	}

	realAddr := d.BaseAddr + uintptr(gcAddress&0x7FFFFFFF)
	buffer := make([]byte, size)

	localIov := iovec{addr: uintptr(unsafe.Pointer(&buffer[0])), len: uint(size)}
	remoteIov := iovec{addr: realAddr, len: uint(size)}

	// 310 is the syscall number for process_vm_readv on x86_64
	_, _, errno := syscall.Syscall6(310, uintptr(d.PID), uintptr(unsafe.Pointer(&localIov)), 1, uintptr(unsafe.Pointer(&remoteIov)), 1, 0)

	if errno != 0 {
		return nil, errno
	}
	return buffer, nil
}

func findDolphinPID() uint32 {
	files, _ := os.ReadDir("/proc")
	for _, f := range files {
		if !f.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(f.Name())
		if err != nil {
			continue
		}

		comm, _ := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
		// Linux process names are often lowercase
		name := strings.TrimSpace(string(comm))
		if name == "dolphin-emu" || name == "dolphin" {
			return uint32(pid)
		}
	}
	return 0
}

func (d *DolphinHookManager) Hook() bool {
	pid := findDolphinPID()
	if pid == 0 {
		return false
	}

	f, err := os.Open(fmt.Sprintf("/proc/%d/maps", pid))
	if err != nil {
		return false
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		// We look for the 32MB GameCube RAM mapping (rw-p)
		if strings.Contains(line, "rw-p") {
			parts := strings.Fields(line)
			addrRange := strings.Split(parts[0], "-")
			start, _ := strconv.ParseUint(addrRange[0], 16, 64)
			end, _ := strconv.ParseUint(addrRange[1], 16, 64)

			if end-start == 0x2000000 {
				d.PID = pid
				d.BaseAddr = uintptr(start)
				d.IsHooked = true
				return true
			}
		}
	}
	return false
}
