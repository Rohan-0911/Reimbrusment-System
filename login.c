#include<stdio.h>
#include<string.h>
#include<stdlib.h>

#include<direct.h>

int user_choice();
void user_input();
void company_name_input();
void country_input();
void name_input();
void email_input();
void user_register();
int username_check();
int user_login_check();
void login_output(int status);

char company_name[100];

char login_creds[] = "files/login_cred.txt", company_name_file[] = "files/company.txt";

char user_name[40], password[10], position[10];
int choice, status=0;


int main() {

    while (1) {
        choice = user_choice();

        if (choice==1) {
            user_input();
            if (username_check()) {
                user_register();
                printf("Registration Successful!!\n\n");
            }
            else {
                printf("Username Already Exists. Try using another User name.\n");
            }
        }

        else if (choice==2) {
            user_input();
            login_output(user_login_check());
        }

        else if (choice==3) {
            printf("Thanks for visiting!!");
            break;
        }

        else {
            printf("Invalid Choice\n\n");
        }
    }
    return 0;
}

int user_choice() {
    printf("\n1. Register your Company/Organistaion\n");
    printf("2. Log-In\n");
    printf("3. Exit\n");
    printf("Choice: ");
    scanf("%d", &choice);
    printf("\n");
    return choice;
}

void user_input() {
    company_name_input();
    country_input();
    name_input();
    email_input();
    printf("Enter Password: ");
    scanf("%s", password);
    printf("\n");
}

void company_name_input() {
    FILE *fptr;

    char dummy_company_name[100];

    fptr = fopen(company_name_file, "a+");

    while(1) {
        printf("Enter Company Name: ");
        scanf("%s", company_name);

        rewind(fptr);

        while(fscanf(fptr, "%s", dummy_company_name) == 1) {
            if (strcmp(company_name, dummy_company_name) == 0) {
                printf("\nCompany already exists.\n");
                break;
            }
        }
        break;
    }

    fprintf(fptr, "%s\n", company_name);

    fclose(fptr);
}

void email_input() {
    int valid_email = 0;
    while(valid_email != 1) {
        printf("Enter E-mail Address: ");
        scanf(" %s", user_name);
        for (int i = 0; user_name[i] != '\0' ; i++) {
            if (user_name[i] == '@') {
                valid_email++;
            }
        }
        if (valid_email == 1) {
            continue;
        }
        printf("\nInvalid E-mail\n");
        printf("Try again\n\n");
        valid_email = 0;
    }
}

void user_register() {
    FILE *fptr;

    fptr = fopen(login_creds, "a");
    fprintf(fptr, "%s", user_name);
    fputc(' ', fptr);
    fprintf(fptr, "%s", password);
    fputc(' ', fptr);
    fprintf(fptr, "%s", "admin");
    fputc('\n', fptr);
    fclose(fptr);
}

int username_check() {
    int user_exist = 1;

    FILE *fptr;

    fptr = fopen(login_creds, "r");
    rewind(fptr);
    
    char username[20], password1[8];

    while(fscanf(fptr, "%s %s %s", username, password1, position) == 2) {

        if (strcmp(username, user_name) == 0) {
            user_exist = 0; 
            break;
        }
    }

    fclose(fptr);
    return user_exist;
}

int user_login_check() {
    int status=0;
    FILE *fptr;

    fptr = fopen(login_creds, "r");
    rewind(fptr);
    
    char username[20], password1[8];

    while(fscanf(fptr, "%s %s %s", username, password1, position) == 2) {
        if (strcmp(username, user_name) == 0) {
            if (strcmp(password1, password) == 0) {
                status++; 
                break;
            }
        }
    }

    fclose(fptr);
    return status;
}

void login_output(int status) {
    if (status == 1) {
        printf("Username & Password is correct.\nLogin Successful!!\n");
    }

    else {
        printf("Incorrect Username and Password.\nTry Again.\n");
    }
}