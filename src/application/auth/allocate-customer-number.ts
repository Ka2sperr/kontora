import { customerNumberForSequence } from "@/domain/auth/customer-number";
import { DomainError } from "@/domain/errors";
import type { UserRepository } from "@/domain/ports/auth";

/**
 * Przydzial numeru klienta.
 *
 * Sekwencja daje kolejne pozycje, a odwzorowanie zamienia je na numery. Mniej
 * wiecej co jedenasta pozycja nie ma poprawnej cyfry kontrolnej — wtedy pobierana
 * jest **nastepna wartosc z sekwencji**, a nie nastepna liczba.
 *
 * Roznica jest istotna: przesuniecie o jeden w tej samej pozycji sprawiloby, ze
 * dwie rozne pozycje daja ten sam numer. Pobranie kolejnej wartosci z sekwencji
 * zuzywa pozycje bezpowrotnie, wiec odwzorowanie zostaje roznowartosciowe kosztem
 * okolo dziewieciu procent zmarnowanych pozycji. Sekwencja ma dziesiec milionow
 * wartosci — nie ma czego oszczedzac.
 */
export async function allocateCustomerNumber(
  users: UserRepository,
): Promise<string> {
  // Ograniczenie liczby prob: przy poprawnym odwzorowaniu szansa na 16 kolejnych
  // odrzucen jest rzedu 10^-17. Jesli to nastapi, cos jest zepsute i lepiej, zeby
  // bylo glosno, niz zeby rejestracja krecila sie w petli.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const sequence = await users.nextCustomerSequence();
    const customerNumber = customerNumberForSequence(sequence);

    if (customerNumber !== null) {
      return customerNumber;
    }
  }

  throw new DomainError(
    "INVALID_CUSTOMER_NUMBER",
    "Nie udalo sie przydzielic numeru klienta.",
  );
}
