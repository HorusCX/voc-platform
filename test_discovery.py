#!/usr/bin/env python3
"""
Test script to debug the discover_maps_locations function
"""
import sys
import os

# Add backend to path
sys.path.insert(0, '/Users/mahmoudsaied/Downloads/Anti_Gravity/VoC/VoC_code/backend')

from services.discover_maps_locations import discover_maps_links

# Test with Calo
print("Testing discovery for 'Calo'...")
result = discover_maps_links("Calo", "https://calo.app")
print(f"\nResult: {result}")
print(f"Number of locations found: {len(result)}")

if result:
    print("\nFirst location:")
    print(result[0])
