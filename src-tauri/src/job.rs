#![cfg(windows)]

use std::io;
use std::mem::size_of;
use std::ptr::null;
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, HANDLE};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Threading::GetCurrentProcess;

/// A Windows Job Object configured to terminate all assigned processes on close.
pub struct JobObject {
    handle: HANDLE,
}

// SAFETY: Windows Job Object handles can be safely transferred across threads.
unsafe impl Send for JobObject {}
// SAFETY: Operations on Job Object handles are thread-safe system calls.
unsafe impl Sync for JobObject {}

impl JobObject {
    /// Create a new anonymous job object configured with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE.
    pub fn new() -> Result<Self, io::Error> {
        // SAFETY: Calling CreateJobObjectW with null attributes creates an anonymous job object with default security.
        let handle = unsafe { CreateJobObjectW(null(), null()) };
        if handle.is_null() {
            // SAFETY: Calling GetLastError immediately after a failed Win32 API call.
            let err = unsafe { GetLastError() };
            return Err(io::Error::from_raw_os_error(err as i32));
        }

        // SAFETY: Zero-initializing the JOBOBJECT_EXTENDED_LIMIT_INFORMATION struct.
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        // SAFETY: Passing a valid job handle, the correct information class, and a valid pointer to info.
        let ret = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };

        if ret == 0 {
            // SAFETY: GetLastError immediately after failed Win32 API call.
            let err = unsafe { GetLastError() };
            // SAFETY: Closing the job handle to prevent resource leaks before returning error.
            unsafe {
                CloseHandle(handle);
            }
            return Err(io::Error::from_raw_os_error(err as i32));
        }

        Ok(JobObject { handle })
    }

    /// Assign the current process to this job object.
    pub fn assign_current_process(&self) -> Result<(), io::Error> {
        // SAFETY: GetCurrentProcess returns a pseudo-handle for the current process which does not need to be closed.
        let current_process = unsafe { GetCurrentProcess() };
        self.assign_handle(current_process)
    }

    /// Assign a specific process handle to this job object.
    pub fn assign_handle(&self, raw: HANDLE) -> Result<(), io::Error> {
        // SAFETY: AssignProcessToJobObject associates the given process handle with this valid job object.
        let ret = unsafe { AssignProcessToJobObject(self.handle, raw) };
        if ret == 0 {
            // SAFETY: Calling GetLastError immediately after failed Win32 API call.
            let err = unsafe { GetLastError() };
            return Err(io::Error::from_raw_os_error(err as i32));
        }
        Ok(())
    }
}

impl Drop for JobObject {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            // SAFETY: Closing the job object handle terminating child processes due to KILL_ON_JOB_CLOSE.
            unsafe {
                CloseHandle(self.handle);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::io::AsRawHandle;
    use std::process::Command;
    use std::thread::sleep;
    use std::time::{Duration, Instant};

    #[test]
    fn test_job_object_kills_child_on_drop() {
        let mut child = Command::new("cmd")
            .args(["/c", "ping", "-n", "30", "127.0.0.1"])
            .spawn()
            .expect("failed to spawn child process");

        let raw_handle = child.as_raw_handle() as HANDLE;
        let job = JobObject::new().expect("failed to create job object");
        job.assign_handle(raw_handle)
            .expect("failed to assign child process to job object");

        // Drop the job object; Windows must terminate the assigned process tree.
        drop(job);

        let start = Instant::now();
        let mut exited = false;
        while start.elapsed() < Duration::from_secs(5) {
            if child.try_wait().expect("try_wait failed").is_some() {
                exited = true;
                break;
            }
            sleep(Duration::from_millis(100));
        }

        if !exited {
            let _ = child.kill();
        }

        assert!(
            exited,
            "Child process did not exit within 5 seconds after job object was dropped"
        );
    }
}
