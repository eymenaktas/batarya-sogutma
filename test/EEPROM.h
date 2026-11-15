#ifndef SAHTE_EEPROM_H
#define SAHTE_EEPROM_H

#include <string.h>

struct SahteEeprom {
  unsigned char hafiza[1024];
  SahteEeprom() { memset(hafiza, 255, sizeof(hafiza)); }
  template <typename T> void get(int adres, T &deger) { memcpy(&deger, hafiza + adres, sizeof(T)); }
  template <typename T> void put(int adres, const T &deger) { memcpy(hafiza + adres, &deger, sizeof(T)); }
};
static SahteEeprom EEPROM;

#endif
