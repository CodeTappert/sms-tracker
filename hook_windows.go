//go:build windows

package main

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

var (
	modkernel32           = syscall.NewLazyDLL("kernel32.dll")
	procOpenProcess       = modkernel32.NewProc("OpenProcess")
	procReadProcessMemory = modkernel32.NewProc("ReadProcessMemory")
	procVirtualQueryEx    = modkernel32.NewProc("VirtualQueryEx")
	procEnumProcesses     = modkernel32.NewProc("K32EnumProcesses")
	procGetModuleBaseName = modkernel32.NewProc("K32GetModuleBaseNameW")
)

// Read reads memory from the Dolphin emulator at the specified GameCube address.
func (d *DolphinHookManager) Read(gcAddress uint32, size int) ([]byte, error) {
	if !d.IsHooked {
		return nil, fmt.Errorf("not hooked")
	}
	realAddr := d.BaseAddr + uintptr(gcAddress&0x7FFFFFFF)
	buffer := make([]byte, size)
	var read int
	ret, _, err := procReadProcessMemory.Call(uintptr(d.Handle), realAddr, uintptr(unsafe.Pointer(&buffer[0])), uintptr(size), uintptr(unsafe.Pointer(&read)))
	if err != nil && ret == 0 {
		return nil, err
	}
	return buffer, nil
}

// getEmuRAMBase scans the Dolphin process memory to find the base address of the emulated GameCube RAM.
func getEmuRAMBase(hProcess syscall.Handle) uintptr {
	var address uintptr
	type MBI struct {
		BaseAddr, AllocBase uintptr
		AllocProt           uint32
		RegionSize          uintptr
		State, Prot, Type   uint32
	}
	var mbi MBI
	for {
		ret, _, _ := procVirtualQueryEx.Call(uintptr(hProcess), address, uintptr(unsafe.Pointer(&mbi)), unsafe.Sizeof(mbi))
		if ret == 0 {
			break
		}
		if mbi.RegionSize == 0x2000000 {
			buf := make([]byte, 3)
			var read int
			procReadProcessMemory.Call(uintptr(hProcess), mbi.BaseAddr, uintptr(unsafe.Pointer(&buf[0])), 3, uintptr(unsafe.Pointer(&read)))
			if string(buf) == "GMS" {
				return mbi.BaseAddr
			}
		}
		address += mbi.RegionSize
	}
	return 0
}

func findDolphinPID() uint32 {
	var pids [1024]uint32
	var cb uint32

	// Enumerate all process IDs
	ret, _, err := procEnumProcesses.Call(
		uintptr(unsafe.Pointer(&pids[0])),
		uintptr(len(pids)*4),
		uintptr(unsafe.Pointer(&cb)),
	)

	if ret == 0 {
		fmt.Printf("Fatal: Could not enumerate processes. Error: %v\n", err)
		return 0
	}

	// cb is the number of bytes returned. Each PID is 4 bytes.
	count := cb / 4
	for i := uint32(0); i < count; i++ {
		pid := pids[i]
		if pid == 0 {
			continue
		}

		// Open process handle with specific access
		h, _, err := procOpenProcess.Call(
			PROCESS_VM_READ|PROCESS_QUERY_INFORMATION,
			0,
			uintptr(pid),
		)

		if h == 0 {
			// If we get "Access is denied" (Error 5), it's a hint we might need Admin
			var errno syscall.Errno
			if errors.As(err, &errno) && errno == 5 {
				// Silently skip system processes we can't touch
				continue
			} else if err != nil {
				fmt.Printf("Warning: Could not open process PID %d. Error: %v\n", pid, err)
				continue
			}
			continue
		}

		var name [256]uint16
		// Get the base name (e.g., "Dolphin.exe")
		nRet, _, _ := procGetModuleBaseName.Call(
			h,
			0,
			uintptr(unsafe.Pointer(&name[0])),
			uintptr(len(name)),
		)

		syscall.CloseHandle(syscall.Handle(h))

		if nRet != 0 {
			processName := syscall.UTF16ToString(name[:])
			if processName == "Dolphin.exe" {
				return pid
			}
		}
	}

	fmt.Println("Dolphin.exe was not found. Ensure it is running.")
	return 0
}

// Hook attempts to connect to the Dolphin emulator and locate the game's RAM.
func (d *DolphinHookManager) Hook() bool {
	pid := findDolphinPID()
	if pid == 0 {
		return false
	}
	hProcess, _ := syscall.OpenProcess(PROCESS_VM_READ|PROCESS_QUERY_INFORMATION, false, pid)
	base := getEmuRAMBase(hProcess)
	if base == 0 {
		syscall.CloseHandle(hProcess)
		return false
	}
	d.PID, d.Handle, d.BaseAddr, d.IsHooked = pid, uintptr(hProcess), base, true
	return true
}

func (d *DolphinHookManager) Close() {
	if d.Handle != 0 {
		syscall.CloseHandle(syscall.Handle(d.Handle))
		d.Handle = 0
	}
}
