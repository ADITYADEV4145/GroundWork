use std::collections::{HashMap, HashSet as Names};
use crate::helpers::trim_name;
mod helpers;

/// Stores named records.
#[derive(Default)]
pub struct Store { names: Vec<String> }

pub trait Reader {
    fn list(&self) -> &[String];
}

impl Store {
    pub fn add(&mut self, name: String) { self.names.push(name); }
}
impl Reader for Store {
    fn list(&self) -> &[String] { &self.names }
}

pub enum State { Ready, Closed }
pub type Key = String;
pub const ENV_KEY: &str = "APP_STORE_KEY";
pub static ENDPOINT: &str = "https://example.com/store";

pub fn normalize(name: &str) -> String {
    if name.trim().is_empty() { return String::from("unknown"); }
    trim_name(name).to_lowercase()
}

fn clean_name(value: &str) -> String {
    value.trim().to_lowercase()
}

pub async fn load() -> Store { Store::default() }
